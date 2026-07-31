import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { VISION_MODEL, generateContentUrl, THINKING_MINIMAL } from "./models.ts";
import {
  clientIp,
  corsHeadersFor,
  createRateLimiter,
  hasValidAnonKey,
  jsonResponse,
} from "./guards.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_VISION_URL = generateContentUrl(VISION_MODEL);

/* One validation call per upload, against four generation calls, so the
 * cap sits well below enhance-image's. Six still allows a few rejected
 * photos in a row before a real user notices. */
const isRateLimited = createRateLimiter(6, 60_000);

/* Validation reads a face out of a stranger's photo. Logging the model
 * response or the parsed analysis would put that in Supabase's log
 * retention, which flatly contradicts the site's own privacy copy
 * ("processed in memory and never stored ... each session is
 * ephemeral"). Set VALIDATE_DEBUG=true as a function secret to turn
 * these back on temporarily when debugging. */
const DEBUG = Deno.env.get("VALIDATE_DEBUG") === "true";
function debugLog(...args: unknown[]): void {
  if (DEBUG) console.log(...args);
}

/* Gemini has no timeout of its own, so a hung upstream would hold the
 * isolate open until the platform killed it. Validation gates an upload;
 * past this point the honest answer is "we didn't check". */
const VALIDATION_TIMEOUT_MS = 15_000;

/* The four fields the prompt asks for, enforced by the API rather than
 * scraped out of prose with a regex. */
const VALIDATION_SCHEMA = {
  type: "object",
  properties: {
    faceCount: { type: "integer" },
    hasPrimarySubject: { type: "boolean" },
    qualityIssues: { type: "array", items: { type: "string" } },
    needsPersonRemoval: { type: "boolean" },
  },
  required: ["faceCount", "hasPrimarySubject", "qualityIssues", "needsPersonRemoval"],
} as const;

/* Only the field we read. Gemini parts also carry inlineData and other
 * shapes we have no use for here. */
interface GeminiPart {
  text?: string;
}

/* Mirrors VALIDATION_SCHEMA. Fields stay optional because a schema is a
 * strong guarantee, not a proof - the defaults below still apply. */
interface ValidationAnalysis {
  faceCount?: number;
  hasPrimarySubject?: boolean;
  qualityIssues?: string[];
  needsPersonRemoval?: boolean;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  let binary = '';
  const chunkSize = 8192;
  
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binary);
}


Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  /* This endpoint spends Gemini quota, so it carries the same guards as
   * enhance-image. It shipped with neither and was open to any POST. */
  if (!hasValidAnonKey(req)) {
    return jsonResponse(
      { isValid: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      401,
      corsHeaders,
    );
  }

  if (isRateLimited(clientIp(req))) {
    return jsonResponse(
      {
        isValid: false,
        error: "Too many requests. Please wait a moment and try again.",
        code: "RATE_LIMITED",
      },
      429,
      corsHeaders,
    );
  }

  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File;

    if (!imageFile) {
      return new Response(
        JSON.stringify({
          isValid: false,
          error: "No image provided"
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const imageBytes = await imageFile.arrayBuffer();
    const base64Image = arrayBufferToBase64(imageBytes);

    const validationPrompt = `Analyze this image for professional profile photo suitability.

CRITICAL INSTRUCTIONS FOR COUNTING PEOPLE:
- Count ONLY complete, fully-visible human beings in the photograph
- A "person" means a complete human body or at least head and shoulders clearly visible in the foreground
- DO NOT count: reflections in mirrors/glass, shadows, partial faces barely visible in backgrounds, people in photos/posters/screens, statues, artwork, blurred background elements, partial body parts
- Be VERY conservative: when in doubt between 1 or 2 people, choose 1
- Only count as 2+ people if there are clearly multiple complete human subjects in the frame

EXAMPLES OF WHAT TO IGNORE:
- A shadow or reflection that looks like a face
- Someone's shoulder barely visible at the edge of the frame
- A blurred person far in the background
- A face on a poster, screen, or photograph within the photo
- Partial faces that are mostly cut off

QUALITY ASSESSMENT:
- Only flag quality issues if they are SEVERE (completely dark, extremely blurry to the point faces aren't recognizable, etc)
- Minor quality issues are acceptable

Provide your analysis in this EXACT JSON format:
{
  "faceCount": <number - count only complete, distinct people>,
  "hasPrimarySubject": <boolean - is there one clear main person?>,
  "qualityIssues": ["list only SEVERE issues"],
  "needsPersonRemoval": <boolean - are there clearly 2 or more complete people that need removal?>
}`;

    const requestBody = {
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: imageFile.type || "image/jpeg",
              data: base64Image
            }
          },
          {
            text: validationPrompt
          }
        ]
      }],
      generationConfig: {
        // Gemini 3 is tuned for its default temperature; the old
        // temperature/topP/topK triple is deliberately not carried over.
        thinkingConfig: THINKING_MINIMAL,
        responseMimeType: "application/json",
        responseSchema: VALIDATION_SCHEMA,
      }
    };

    const response = await fetch(`${GEMINI_VISION_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", errorText);
      
      return new Response(
        JSON.stringify({ 
          isValid: false,
          error: "Unable to validate image. Please try again." 
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const result = await response.json();
    debugLog("Gemini validation response:", JSON.stringify(result, null, 2));

    if (!result.candidates || !result.candidates[0]?.content?.parts) {
      return new Response(
        JSON.stringify({ 
          isValid: false,
          error: "Unable to analyze image. Please try again." 
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const textContent = (result.candidates[0].content.parts as GeminiPart[])
      .map((part) => part.text)
      .filter((text): text is string => typeof text === 'string')
      .join('');

    debugLog("Raw Gemini text response:", textContent);

    /* responseSchema means the body is already JSON - no regex scrape.
     * A parse failure here is a real contract break, not prose to dig
     * through, so it is reported rather than salvaged. */
    let analysisResult: ValidationAnalysis;
    try {
      analysisResult = JSON.parse(textContent) as ValidationAnalysis;
    } catch (parseError) {
      console.error("Schema-mode response did not parse as JSON:", textContent, parseError);

      return new Response(
        JSON.stringify({
          isValid: false,
          error: "Unable to analyze image properly. Please try again."
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }
    const faceCount = analysisResult.faceCount || 0;
    const hasPrimarySubject = analysisResult.hasPrimarySubject !== false;
    const qualityIssues = analysisResult.qualityIssues || [];
    const needsPersonRemoval = analysisResult.needsPersonRemoval || false;

    debugLog("Parsed analysis:", { faceCount, hasPrimarySubject, qualityIssues, needsPersonRemoval });

    let isValid = true;
    let errorMessage = null;

    if (faceCount === 0) {
      isValid = false;
      errorMessage = "No face detected in the image. Please upload a clear photo showing your face.";
    } else if (qualityIssues.length > 0 && qualityIssues.some((issue: string) =>
      issue.toLowerCase().includes('extremely') ||
      issue.toLowerCase().includes('completely') ||
      issue.toLowerCase().includes('severely') ||
      issue.toLowerCase().includes('totally') ||
      issue.toLowerCase().includes('very dark') ||
      issue.toLowerCase().includes('unrecognizable')
    )) {
      isValid = false;
      errorMessage = "Image quality issues detected. Please use a clearer, well-lit photo.";
    }

    return new Response(
      JSON.stringify({
        isValid,
        error: errorMessage,
        faceCount,
        needsPersonRemoval: faceCount >= 2 || needsPersonRemoval,
        metadata: {
          hasPrimarySubject,
          qualityIssues,
        }
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Validation error:", error);
    
    return new Response(
      JSON.stringify({ 
        isValid: false,
        error: "An error occurred during validation. Please try again.",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
