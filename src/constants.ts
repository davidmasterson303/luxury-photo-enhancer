export const AUTO_VARIATION_PROMPTS = [
  {
    label: 'Natural',
    description: 'Subtle improvements to lighting and skin',
    prompt: 'Improve lighting to be more flattering, optimize framing and cropping for a professional profile photo suitable for a professional profile. Apply very light and natural retouching to blemishes while maintaining authentic appearance and skin texture. Keep the background and overall composition exactly the same. Crop to focus on head and shoulders in an ideal portrait orientation. Subtle enhancement only - the person should still look exactly like themselves.',
  },
  {
    label: 'Corporate',
    description: 'Polished corporate headshot style',
    prompt: 'Create a professional executive headshot by changing: (1) the background to an upscale professional environment like a modern office, library, or elegant interior setting, (2) the lighting to be flattering and sophisticated, and (3) the clothing to upscale, gender-appropriate business attire befitting high net worth individuals (tailored suit, premium blazer, or elegant professional attire). Optimize framing and cropping for a profile photo suitable for a professional profile. Crop to focus on head and shoulders in an ideal portrait orientation. DO NOT modify the person\'s face, skin, facial features, or expression in any way. Keep their face exactly as it appears in the original photo. Only change: background, lighting, and clothing. The person\'s face must look 100% like themselves.',
  },
  {
    label: 'Vacation',
    description: 'Relaxed tropical setting with natural smile',
    prompt: 'Place person in a realistic tropical beach vacation setting with authentic natural lighting, warm golden hour sunlight, genuine happy smile and relaxed expression. Change clothing to upscale beach vacation attire (elegant resort wear, premium linen shirts, sophisticated beach casual). The beach background should look completely real and natural - real sand, real ocean, real sky. Remove any furniture, couches, or indoor items - the person should be outdoors on the beach. Optimize framing and cropping for a profile photo suitable for a professional profile. Crop to focus on head and shoulders in an ideal portrait orientation. DO NOT modify the person\'s face, skin, or facial features. Only change: background, lighting, and clothing. Maintain the person\'s authentic facial appearance.',
  },
  {
    label: 'Editorial',
    description: 'High-fashion editorial photography style',
    prompt: 'Transform this into a high-fashion editorial photography portrait with these specific changes: (1) studio or editorial-quality background (clean minimal background, dramatic gradient, or sophisticated architectural setting), (2) dramatic professional lighting with strong definition and depth (fashion photography lighting, dramatic shadows, or high-contrast professional setup), (3) designer professional attire or elevated fashion-forward clothing appropriate for editorial photography, (4) sophisticated color palette (rich monochromatic tones, elegant black and white, or refined color grading). Optimize framing and cropping for a striking profile photo suitable for a professional profile. Crop to focus on head and shoulders in an ideal portrait orientation. The aesthetic should be editorial, sophisticated, and modern - think Vogue or fashion magazine quality. DO NOT modify the person\'s face, skin, facial features, or expression in any way. Maintain a confident, professional demeanor with appropriate expressions and composed poses. Keep their face exactly as it appears in the original photo. Only change: background, lighting, clothing, and color grading. The person must look 100% like themselves with authentic facial features.',
  },
];

/* Returned by both edge functions once the day's Gemini budget is spent,
 * or when the demo has been closed by hand. Lives here rather than in
 * either service because both speak it. */
export const BUDGET_EXHAUSTED = 'BUDGET_EXHAUSTED';

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/* HEIC/HEIF are converted to JPEG in the browser before enhancement
 * (see toDecodableFile in services/imageEnhancement). */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
export const MAX_CUSTOM_PROMPT_LENGTH = 200;
