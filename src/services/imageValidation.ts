import { BUDGET_EXHAUSTED } from '../constants';
import {
  evaluatePrompt,
  PROMPT_BLOCKED_MESSAGE,
} from './promptRules';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  faceCount?: number;
  needsPersonRemoval?: boolean;
  /* Live animals in the scene. Flagged for removal rather than refusal —
   * a dog in the shot is not a reason to send someone back to the upload
   * screen when the image model can take it out. */
  needsAnimalRemoval?: boolean;
  /* Set only for BUDGET_EXHAUSTED. Callers use it to show the capacity
   * screen rather than the "try another photo" toast. */
  code?: string;
  /* True when validation did not actually run and we let the upload
   * through anyway. `isValid: true` alone cannot distinguish "checked
   * and fine" from "never checked" — which is how a dead validator
   * stayed invisible for months. Callers must not read faceCount or
   * needsPersonRemoval/needsAnimalRemoval when this is set. */
  validationSkipped?: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const VALIDATE_API_URL = `${SUPABASE_URL}/functions/v1/validate-image`;

export async function validateImageForProfile(imageFile: File): Promise<ValidationResult> {
  try {
    const formData = new FormData();
    formData.append('image', imageFile);

    const response = await fetch(VALIDATE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      /* Budget exhaustion is a definite answer, not an outage. Failing
       * open on it would send the visitor to the grid to upload the
       * image four more times, only to be refused by every generation
       * call — so surface it here, one round trip in, instead. */
      const body = await response.json().catch(() => null);
      if (body?.code === BUDGET_EXHAUSTED) {
        return { isValid: false, error: body.error as string, code: BUDGET_EXHAUSTED };
      }

      // Anything else is a service problem, not a content problem. Fail
      // open: a validator outage must not stop people using the app.
      console.warn(`Validation service error (${response.status}), proceeding without validation`);
      return { isValid: true, validationSkipped: true };
    }

    const result = await response.json();
    return {
      isValid: result.isValid,
      error: result.error,
      faceCount: result.faceCount,
      needsPersonRemoval: result.needsPersonRemoval || false,
      needsAnimalRemoval: result.needsAnimalRemoval || false,
    };
  } catch (error) {
    // Network/connection error — pass through rather than blocking
    console.warn('Validation unreachable, proceeding without validation:', error);
    return { isValid: true, validationSkipped: true };
  }
}

/* -- Custom prompt checks ----------------------------------------------
 *
 * Two layers, and the distinction matters.
 *
 * ENFORCEMENT is evaluatePrompt, imported from promptRules.ts, which is
 * byte-identical to the copy the edge function uses. Anything it refuses,
 * the server refuses too. This layer exists purely so the visitor gets an
 * answer without a round trip - it is not what keeps anything out, since
 * a caller can simply not be this client.
 *
 * GUIDANCE is everything below it: minimum length, and a nudge to describe
 * lighting, background, clothing or colour. These are UX. Being wrong here
 * costs someone a rephrase, so the client is allowed to have opinions the
 * server does not.
 */
export function validateCustomPrompt(prompt: string): ValidationResult {
  const normalizedPrompt = prompt.toLowerCase().trim();

  const verdict = evaluatePrompt(normalizedPrompt);
  if (!verdict.allowed) {
    return { isValid: false, error: PROMPT_BLOCKED_MESSAGE };
  }

  if (normalizedPrompt.length < 10) {
    return {
      isValid: false,
      error: 'Please provide a more detailed description of the enhancements you would like (at least 10 characters).',
    };
  }

  /* Guidance only, and deliberately generous: this is a hint that the tool
   * adjusts photographs rather than a rule about vocabulary. */
  const requiredThemes = [
    'lighting', 'light', 'bright', 'dark', 'shadow', 'sunlight', 'glow', 'warm', 'cool', 'soft',
    'background', 'backdrop', 'setting', 'environment', 'scene', 'ambiance', 'surroundings', 'location', 'room', 'office', 'outdoor', 'indoor',
    'clothing', 'attire', 'outfit', 'shirt', 'jacket', 'dress', 'suit', 'top', 'style', 'look', 'fashion', 'wear',
    'professional', 'polished', 'refined', 'elegant', 'sophisticated', 'clean', 'crisp', 'natural', 'minimal',
    'color', 'colour', 'tone', 'warmth', 'brightness', 'contrast', 'saturation', 'hue', 'tint', 'palette',
    'blur', 'focus', 'sharp', 'clarity', 'detail', 'depth',
  ];

  if (!requiredThemes.some(theme => normalizedPrompt.includes(theme))) {
    return {
      isValid: false,
      error: 'Please describe enhancements related to lighting, background, clothing, or color adjustments. For example: "warmer lighting with a professional office background".',
    };
  }

  return { isValid: true };
}
