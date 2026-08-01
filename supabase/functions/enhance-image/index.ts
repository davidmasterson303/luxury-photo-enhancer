import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { IMAGE_MODEL, generateContentUrl } from "./models.ts";
import {
  clientIp,
  corsHeadersFor,
  createRateLimiter,
  jsonResponse,
} from "./guards.ts";
import { BUDGET_RESPONSE, reserveCall } from "./budget.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_API_URL = generateContentUrl(IMAGE_MODEL);

/* A normal session uses 4 calls per upload + occasional retries and
 * customs, so 12/min is roughly two full sessions back to back. */
const isRateLimited = createRateLimiter(12, 60_000);

/* -- Prompt validation - word-boundary matching -------------------
 * Substring matching produced false positives ("fireplace" -> 'fire',
 * "space between" -> 'space'). Word boundaries fix those; the list is
 * trimmed to things that actually conflict with a professional
 * portrait. Error copy frames capability, not accusation. */
const PROHIBITED_WORDS = [
  "shark", "sharks", "dragon", "dragons", "unicorn", "unicorns",
  "monster", "monsters", "alien", "aliens", "zombie", "zombies",
  "vampire", "vampires", "werewolf", "werewolves",
  "naked", "nude", "bikini", "shirtless", "topless", "underwear",
  "celebrity", "famous",
  "anime", "cartoon", "comic", "superhero",
  "explosion", "weapon", "gun", "knife",
  "blood", "gore", "violent", "death",
  "drugs", "alcohol", "smoking",
  "wizard", "witch", "magical",
  "astronaut", "levitating",
  "military", "soldier", "combat",
];

const CONTEXTUAL_WORDS = ["sexy", "seductive", "provocative", "sultry"];

const NEGATION_PHRASES = [
  "no ", "not ", "avoid ", "without ", "never ", "don't ", "do not ",
  "absolutely no", "remove any", "eliminating", "excluding",
];

const PROMPT_BLOCKED_MESSAGE =
  "We can only adjust lighting, background, clothing, and color - try describing those instead.";

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

/* A negation governs its own clause, so the search for one stops at the
 * clause boundary. A flat character window lets one early "no" launder
 * every later use of the word, which makes "no X and X" indistinguishable
 * from "no X and no X". */
const CLAUSE_BOUNDARY = /[,.;:!?]|\band\b|\bbut\b|\bthen\b|\balso\b|\bplus\b/gi;

/* True only when EVERY occurrence sits in a negation context.
 *
 * This used to call text.search, which returns the FIRST match and nothing
 * else, so "no sexy lighting and sexy pose" was cleared on the strength of
 * its opening clause. Mirrors everyOccurrenceNegated in
 * src/services/imageValidation.ts - the word lists on the two sides differ
 * on purpose, the matching semantics must not. */
function isInNegationContext(word: string, text: string): boolean {
  const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  let found = false;

  for (const match of text.matchAll(pattern)) {
    found = true;
    const segments = text.substring(0, match.index).split(CLAUSE_BOUNDARY);
    const clause = segments[segments.length - 1];
    if (!NEGATION_PHRASES.some((phrase) => clause.includes(phrase))) return false;
  }

  return found;
}

function validatePromptServerSide(prompt: string): { isValid: boolean; error?: string } {
  const normalized = prompt.toLowerCase().trim();

  for (const word of [...PROHIBITED_WORDS, ...CONTEXTUAL_WORDS]) {
    if (hasWord(normalized, word) && !isInNegationContext(word, normalized)) {
      return { isValid: false, error: PROMPT_BLOCKED_MESSAGE };
    }
  }
  return { isValid: true };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  let binary = "";
  const chunkSize = 8192;

  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }

  if (isRateLimited(clientIp(req))) {
    return jsonResponse(
      { error: "Too many requests. Please wait a moment and try again.", code: "RATE_LIMITED" },
      429,
      cors,
    );
  }

  /* Reserved before the body is even read: the point is to spend nothing,
   * and parsing a 10MB upload we are about to refuse is wasted work. 503
   * rather than 429 — this is capacity, not the caller's rate. */
  const budget = await reserveCall();
  if (!budget.allowed) {
    return jsonResponse(BUDGET_RESPONSE, 503, cors);
  }

  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File;
    const prompt = formData.get("prompt") as string;
    const needsPersonRemoval = formData.get("needs_person_removal") === "true";

    if (!imageFile || !prompt) {
      return jsonResponse(
        { error: "Missing image or prompt", code: "BAD_REQUEST" },
        400,
        cors,
      );
    }

    const promptValidation = validatePromptServerSide(prompt);
    if (!promptValidation.isValid) {
      return jsonResponse(
        { error: promptValidation.error, code: "PROMPT_NOT_SUPPORTED" },
        400,
        cors,
      );
    }

    const imageBytes = await imageFile.arrayBuffer();
    const base64Image = arrayBufferToBase64(imageBytes);

    let enhancementPrompt = prompt;

    if (needsPersonRemoval) {
      enhancementPrompt = `First, carefully identify and remove any additional people from this photo, keeping ONLY the main primary subject person. Fill in the removed areas naturally with appropriate background that matches the scene. Then apply these enhancements: ${prompt}. The main subject's face, features, and appearance must remain completely unchanged - only remove other people and enhance the photo quality, lighting, and composition.`;
    }

    const requestBody = {
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: imageFile.type || "image/jpeg",
              data: base64Image,
            },
          },
          {
            text: enhancementPrompt,
          },
        ],
      }],
      generationConfig: {
        responseModalities: ["Image"],
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", response.status, errorText);
      const code =
        response.status === 429 ? "RATE_LIMITED"
        : response.status >= 500 ? "UPSTREAM_ERROR"
        : "GENERATION_FAILED";
      return jsonResponse(
        { error: `Image generation failed (${response.status})`, code },
        response.status === 429 ? 429 : 502,
        cors,
      );
    }

    const result = await response.json();

    if (result.candidates && result.candidates[0]?.content?.parts) {
      const parts = result.candidates[0].content.parts;

      for (const part of parts) {
        const data = part.inlineData?.data ?? part.inline_data?.data;
        const mime = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? "image/png";
        if (data) {
          return jsonResponse(
            { enhanced_image_url: `data:${mime};base64,${data}` },
            200,
            cors,
          );
        }
      }
    }

    /* Reaching here means Gemini answered 200 and sent no image, which is
     * what a policy refusal looks like: the request succeeded, the model
     * declined to produce a picture. The !response.ok branch above never
     * fires for it, so before this existed the function returned NO_IMAGE
     * having logged precisely nothing — a silent failure that presents as
     * "This one didn't develop" with no trail anywhere.
     *
     * Deliberately selective about what goes in the log. The verbose
     * logging in validate-image was removed because it printed the model's
     * analysis of a user's photo, and that reasoning applies here: record
     * why the generation stopped, never the content it was given. */
    const candidate = result.candidates?.[0];
    console.error("Gemini returned no image.", JSON.stringify({
      finishReason: candidate?.finishReason,
      safetyRatings: candidate?.safetyRatings,
      promptFeedback: result.promptFeedback,
      partKinds: (candidate?.content?.parts ?? []).map((p: Record<string, unknown>) =>
        Object.keys(p).join("+")
      ),
    }));

    /* A refusal is a verdict on this image, not a transient fault. Retrying
     * spends a second generation call to be told the same thing, times four
     * slots. Distinguished from NO_IMAGE so the client can stop rather than
     * retry, and so the UI can say something truthful instead of implying
     * the photo merely failed to develop. */
    const stopped = candidate?.finishReason;
    if (stopped && stopped !== "STOP" && stopped !== "MAX_TOKENS") {
      return jsonResponse(
        {
          error: "This photo could not be processed. Please try a different one.",
          code: "IMAGE_BLOCKED",
        },
        502,
        cors,
      );
    }

    return jsonResponse(
      { error: "No image was generated. Please try again.", code: "NO_IMAGE" },
      502,
      cors,
    );
  } catch (error) {
    console.error("Error:", error);
    return jsonResponse(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      500,
      cors,
    );
  }
});
