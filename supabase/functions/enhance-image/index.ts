import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* ── CORS — locked to known origins (was `*`) ─────────────────────
 * The function spends Gemini quota, so it only answers the demo
 * domain and local dev. Unknown origins get the demo domain back,
 * which makes the browser block the response. */
const ALLOWED_ORIGINS = new Set([
  "https://luxuryphotoenhancer-demo.davidmasterson.co",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allowed =
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://luxuryphotoenhancer-demo.davidmasterson.co";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
// Injected automatically into every Supabase Edge Function.
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

/* ── Rate limiting — per-IP sliding window ────────────────────────
 * In-memory per isolate: not perfect across cold starts, but stops
 * the cheap abuse case (a loop hammering the endpoint). A normal
 * session uses 4 calls per upload + occasional retries/customs. */
const RATE_LIMIT_MAX = 12;
const RATE_LIMIT_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const stamps = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (stamps.length >= RATE_LIMIT_MAX) {
    hits.set(ip, stamps);
    return true;
  }
  stamps.push(now);
  hits.set(ip, stamps);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/* ── Prompt validation — word-boundary matching ───────────────────
 * Substring matching produced false positives ("fireplace" → 'fire',
 * "space between" → 'space'). Word boundaries fix those; the list is
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
  "We can only adjust lighting, background, clothing, and color — try describing those instead.";

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

function isInNegationContext(word: string, text: string): boolean {
  const idx = text.search(new RegExp(`\\b${word}\\b`, "i"));
  if (idx === -1) return false;
  const preceding = text.substring(Math.max(0, idx - 50), idx);
  return NEGATION_PHRASES.some((phrase) => preceding.includes(phrase));
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

  /* ── Auth — require the project anon key ──────────────────────
   * The anon key is public by design, but requiring it means random
   * cross-origin POSTs (curl loops that never loaded our client)
   * can't spend Gemini quota without at least presenting it, and it
   * restores parity with validate-image, which already required it. */
  if (SUPABASE_ANON_KEY) {
    const authHeader = req.headers.get("authorization") ?? "";
    const apiKeyHeader = req.headers.get("apikey") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (bearer !== SUPABASE_ANON_KEY && apiKeyHeader !== SUPABASE_ANON_KEY) {
      return jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401, cors);
    }
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown";
  if (isRateLimited(ip)) {
    return jsonResponse(
      { error: "Too many requests. Please wait a moment and try again.", code: "RATE_LIMITED" },
      429,
      cors,
    );
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
