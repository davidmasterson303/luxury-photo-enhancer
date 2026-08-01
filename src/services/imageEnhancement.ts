import { BUDGET_EXHAUSTED } from '../constants';

export interface EnhancementResult {
  success: boolean;
  enhancedImageUrl?: string;
  error?: string;
  code?: string;
}

const NEGATIVE_PROMPT_INJECTION =
  'Do not alter hair length. Do not change facial bone structure. Do not alter original hairline. Do not change clothing structure.';

const POSITIVE_PROMPT_INJECTION =
  'Subtle hair styling, refined professional studio lighting, strict adherence to original physical proportions.';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ENHANCE_API_URL = `${SUPABASE_URL}/functions/v1/enhance-image`;

// One retry (2 attempts total). The old 3-attempt loop, multiplied by four
// parallel variations, could fire 12 Gemini calls off one click.
const MAX_ATTEMPTS = 2;
const RETRY_DELAY = 2000;

// Codes that are pointless to retry (the request itself is rejected).
// BUDGET_EXHAUSTED belongs here: retrying spends the retry to be told the
// same thing, and the answer will not change until tomorrow.
const NON_RETRYABLE = new Set([
  'PROMPT_NOT_SUPPORTED',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  /* A policy refusal is a verdict on this image, not a transient fault.
   * Retrying spends a second generation call per slot - four of them - to
   * be told the same thing. */
  'IMAGE_BLOCKED',
  BUDGET_EXHAUSTED,
]);

const FRIENDLY_MESSAGES: Record<string, string> = {
  [BUDGET_EXHAUSTED]: 'The atelier is fully booked today. Please return tomorrow.',
  RATE_LIMITED: 'The atelier is momentarily busy. Please wait a moment and try again.',
  UPSTREAM_ERROR: 'The enhancement service had a hiccup. Please try again.',
  GENERATION_FAILED: 'That photo could not be enhanced. Try a different photo.',
  IMAGE_BLOCKED: 'This photo could not be processed. Please try a different one.',
  NO_IMAGE: 'No image came back. Please try again.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function enhanceImage(
  imageFile: File,
  prompt: string,
  needsPersonRemoval = false
): Promise<EnhancementResult> {
  let lastResult: EnhancementResult = { success: false, error: 'Failed to enhance image.' };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const composedPrompt = `${POSITIVE_PROMPT_INJECTION} ${prompt} ${NEGATIVE_PROMPT_INJECTION}`;

      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('prompt', composedPrompt);
      formData.append('needs_person_removal', needsPersonRemoval.toString());

      const response = await fetch(ENHANCE_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: formData,
      });

      const result = await response.json().catch(() => ({} as Record<string, unknown>));
      const code = (result.code as string) || (response.status === 429 ? 'RATE_LIMITED' : undefined);

      if (response.ok && result.enhanced_image_url) {
        return { success: true, enhancedImageUrl: result.enhanced_image_url as string };
      }

      lastResult = {
        success: false,
        code,
        error:
          (code && FRIENDLY_MESSAGES[code]) ||
          (result.error as string) ||
          `Enhancement failed (${response.status}).`,
      };

      if (code && NON_RETRYABLE.has(code)) return lastResult;
    } catch (error) {
      console.error(`Enhancement attempt ${attempt} failed:`, error);
      lastResult = {
        success: false,
        code: 'NETWORK',
        error: 'Could not reach the enhancement service. Check your connection and try again.',
      };
    }

    if (attempt < MAX_ATTEMPTS) {
      // Jittered backoff so four parallel variations don't retry in lockstep.
      await delay(RETRY_DELAY * attempt + Math.random() * 1000);
    }
  }

  return lastResult;
}

/* Thrown when the browser cannot turn the chosen file into pixels.
 * Distinguished from a generation failure so the UI can say what is
 * actually wrong instead of "An unexpected error occurred". */
export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageDecodeError';
  }
}

/* iOS hands over HEIC with an empty `type` often enough that sniffing
 * the extension is not optional. */
export function isHeicFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return true;
  return type === '' && /\.hei[cf]$/i.test(file.name);
}

/* HEIC is the default iPhone format and therefore the likeliest input
 * this app gets, but no engine outside Safari will decode it — the old
 * `new Image()` path just fired onerror and dead-ended the upload on a
 * generic error screen. heic2any is ~500KB, so it is imported here and
 * only when someone actually hands us a HEIC. */
async function toDecodableFile(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;

  try {
    const { default: heic2any } = await import('heic2any');
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    return new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error('HEIC conversion failed:', error);
    throw new ImageDecodeError(
      'That HEIC photo could not be read. Please export it as JPEG and try again.'
    );
  }
}

export async function resizeImageIfNeeded(
  file: File,
  maxWidth = 2000,
  maxHeight = 2000
): Promise<File> {
  const source = await toDecodableFile(file);

  /* createImageBitmap decodes the File directly. The previous path read
   * the whole thing into a base64 data URL first — a ~13MB string for a
   * 10MB upload, held alongside the decoded bitmap, on a phone. */
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch (error) {
    console.error('Image decode failed:', error);
    throw new ImageDecodeError(
      'That image could not be read. Please try a JPG or PNG.'
    );
  }

  try {
    if (bitmap.width <= maxWidth && bitmap.height <= maxHeight) {
      return source;
    }

    /* One scale factor for both axes: the branch-per-orientation version
     * this replaces could leave the long edge over the limit whenever
     * maxWidth and maxHeight differed. Rounded because a fractional
     * canvas dimension is silently truncated. */
    const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new ImageDecodeError('This browser could not process the image. Please try another.');
    }

    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );
    if (!blob) {
      throw new ImageDecodeError('This browser could not process the image. Please try another.');
    }

    return new File([blob], source.name, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
