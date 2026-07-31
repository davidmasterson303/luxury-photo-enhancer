/* -- Gemini model IDs ----------------------------------------------
 *
 * [!]  DUPLICATED FILE. An identical copy lives at
 *     supabase/functions/validate-image/models.ts
 *     Change one, change both. They must not drift.
 *
 * Why the duplication: these functions are deployed through the Supabase
 * dashboard editor, whose file tree is flat - it cannot express the
 * `../_shared/` layout the CLI supports. Collapsing to a per-function
 * copy is the price of deploying without the CLI.
 *
 * Nothing else in this repo may hardcode a `gemini-*` string. The last
 * time one was buried in a URL literal it was `gemini-2.0-flash-exp`,
 * that alias was retired, and the validator returned 500 for months
 * without anyone noticing.
 *
 * Verified against Google's live model catalogue on 30 Jul 2026.
 */

/** Vision + structured JSON. Verified: $0.25/$1.50 per 1M in/out,
 *  earliest shutdown 7 May 2027. */
export const VISION_MODEL = "gemini-3.1-flash-lite";

/** Image generation ("Nano Banana 2"). GA, not preview.
 *  Replaces gemini-2.5-flash-image, whose earliest shutdown is 2 Oct 2026. */
export const IMAGE_MODEL = "gemini-3.1-flash-image";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function generateContentUrl(model: string): string {
  return `${API_BASE}/${model}:generateContent`;
}

/** Gemini 3.x replaces 2.5's numeric `thinkingBudget` with `thinkingLevel`.
 *  Passing both in one request is rejected with 400 - verified. MINIMAL is
 *  the floor on Flash Lite; thinking cannot be disabled outright. */
export const THINKING_MINIMAL = { thinkingLevel: "MINIMAL" } as const;
