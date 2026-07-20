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
const NON_RETRYABLE = new Set(['PROMPT_NOT_SUPPORTED', 'BAD_REQUEST', 'UNAUTHORIZED']);

const FRIENDLY_MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'The atelier is momentarily busy. Please wait a moment and try again.',
  UPSTREAM_ERROR: 'The enhancement service had a hiccup. Please try again.',
  GENERATION_FAILED: 'That photo could not be enhanced. Try a different photo.',
  NO_IMAGE: 'No image came back. Please try again.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function enhanceImage(
  imageFile: File,
  prompt: string,
  _apiKey?: string,
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

export async function resizeImageIfNeeded(file: File, maxWidth = 2000, maxHeight = 2000): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    reader.onerror = reject;

    img.onload = () => {
      if (img.width <= maxWidth && img.height <= maxHeight) {
        resolve(file);
        return;
      }

      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const resizedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(resizedFile);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        },
        'image/jpeg',
        0.92
      );
    };

    img.onerror = reject;

    reader.readAsDataURL(file);
  });
}
