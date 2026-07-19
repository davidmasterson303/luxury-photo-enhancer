import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_VISION_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";

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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
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
        temperature: 0.2,
        topP: 0.8,
        topK: 20,
      }
    };

    const response = await fetch(`${GEMINI_VISION_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
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
    console.log("Gemini validation response:", JSON.stringify(result, null, 2));

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

    const textContent = result.candidates[0].content.parts
      .filter((part: any) => part.text)
      .map((part: any) => part.text)
      .join('');

    console.log("Raw Gemini text response:", textContent);

    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in response:", textContent);
      
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

    const analysisResult = JSON.parse(jsonMatch[0]);
    const faceCount = analysisResult.faceCount || 0;
    const hasPrimarySubject = analysisResult.hasPrimarySubject !== false;
    const qualityIssues = analysisResult.qualityIssues || [];
    const needsPersonRemoval = analysisResult.needsPersonRemoval || false;

    console.log("Parsed analysis:", { faceCount, hasPrimarySubject, qualityIssues, needsPersonRemoval });

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
