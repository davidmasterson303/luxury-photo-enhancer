export interface EnhancementResult {
  success: boolean;
  enhancedImageUrl?: string;
  error?: string;
}

const NEGATIVE_PROMPT_INJECTION =
  'Do not alter hair length. Do not change facial bone structure. Do not alter original hairline. Do not change clothing structure.';

const POSITIVE_PROMPT_INJECTION =
  'Subtle hair styling, refined professional studio lighting, strict adherence to original physical proportions.';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ENHANCE_API_URL = `${SUPABASE_URL}/functions/v1/enhance-image`;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function enhanceImage(
  imageFile: File,
  prompt: string,
  _apiKey?: string,
  needsPersonRemoval = false
): Promise<EnhancementResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const composedPrompt = `${POSITIVE_PROMPT_INJECTION} ${prompt} ${NEGATIVE_PROMPT_INJECTION}`;

      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('prompt', composedPrompt);
      formData.append('needs_person_removal', needsPersonRemoval.toString());

      const response = await fetch(ENHANCE_API_URL, {
        method: 'POST',
        body: formData,
      });

      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY * attempt);
          continue;
        }
        return {
          success: false,
          error: 'Service is currently busy. Please try again in a few moments.',
        };
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message || `API request failed with status ${response.status}`;
        const errorDetails = errorData.details ? `\n${errorData.details}` : '';
        throw new Error(errorMessage + errorDetails);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      if (result.enhanced_image_url) {
        return {
          success: true,
          enhancedImageUrl: result.enhanced_image_url,
        };
      }

      throw new Error('No enhanced image returned from API');
    } catch (error) {
      lastError = error as Error;
      console.error(`Enhancement attempt ${attempt} failed:`, error);

      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY * attempt);
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Failed to enhance image after multiple attempts. Please try again.',
  };
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
