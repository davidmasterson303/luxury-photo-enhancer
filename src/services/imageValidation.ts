export interface ValidationResult {
  isValid: boolean;
  error?: string;
  faceCount?: number;
  needsPersonRemoval?: boolean;
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
      // Service error (not a content issue) — pass through rather than blocking
      console.warn('Validation service error, proceeding without validation');
      return { isValid: true };
    }

    const result = await response.json();
    return {
      isValid: result.isValid,
      error: result.error,
      faceCount: result.faceCount,
      needsPersonRemoval: result.needsPersonRemoval || false,
    };
  } catch (error) {
    // Network/connection error — pass through rather than blocking
    console.warn('Validation unreachable, proceeding without validation:', error);
    return { isValid: true };
  }
}

export function validateCustomPrompt(prompt: string): ValidationResult {
  const normalizedPrompt = prompt.toLowerCase().trim();

  const allowedPhrases = [
    'no sexy',
    'no sultry',
    'no provocative',
    'gender-appropriate',
    'woman',
    'man',
    'female',
    'male',
  ];

  const isAllowedPhrase = (keyword: string): boolean => {
    return allowedPhrases.some(phrase => {
      const regex = new RegExp(`\\b${phrase}\\b`, 'i');
      const match = normalizedPrompt.match(regex);
      if (!match) return false;

      const keywordPos = normalizedPrompt.indexOf(keyword);
      const phrasePos = match.index!;
      return Math.abs(keywordPos - phrasePos) < phrase.length + 5;
    });
  };

  const prohibitedKeywords = [
    'shark', 'sharks', 'dragon', 'dragons', 'unicorn', 'unicorns',
    'monster', 'monsters', 'alien', 'aliens', 'zombie', 'zombies',
    'vampire', 'vampires', 'werewolf', 'werewolves',
    'naked', 'nude', 'bikini', 'shirtless', 'topless', 'underwear',
    'celebrity', 'famous', 'movie star', 'actor', 'actress',
    'anime', 'cartoon', 'comic', 'superhero',
    'younger', 'older', 'child', 'kid', 'baby',
    'plastic surgery', 'botox', 'fillers',
    'explosion', 'burning', 'weapon', 'gun', 'knife',
    'blood', 'gore', 'violent', 'death', 'dead',
    'drugs', 'alcohol', 'smoking', 'cigarette', 'joint',
    'fantasy', 'magical', 'wizard', 'witch', 'fairy',
    'space', 'astronaut', 'planet', 'mars',
    'underwater', 'ocean floor', 'diving', 'swimming with',
    'flying', 'levitating', 'jumping off',
    'motorcycle', 'vehicle', 'driving',
    'holding ball',
    'military', 'soldier', 'combat',
    'historical', 'period costume', 'medieval', 'ancient',
  ];

  const conditionalKeywords = ['sexy', 'seductive', 'provocative', 'sultry'];

  for (const keyword of prohibitedKeywords) {
    if (normalizedPrompt.includes(keyword)) {
      return {
        isValid: false,
        error: 'Your prompt contains content that is not appropriate for professional profile photos. Please focus on lighting, background, and clothing enhancements only.',
      };
    }
  }

  for (const keyword of conditionalKeywords) {
    if (normalizedPrompt.includes(keyword) && !isAllowedPhrase(keyword)) {
      return {
        isValid: false,
        error: 'Your prompt contains content that is not appropriate for professional profile photos. Please focus on lighting, background, and clothing enhancements only.',
      };
    }
  }

  const phrasePatterns = [
    /with (a|an|the)?\s*(animal|creature|pet|dog|cat|horse)/i,
    /riding (a|an|the)?\s*(animal|creature|shark|dragon)/i,
    /change (my|the)?\s*(face|facial|nose|chin)/i,
    /make me (look|appear)\s*(younger|older|different)/i,
    /like (a|an)?\s*(celebrity|famous|star)/i,
    /with (weapons?|guns?|knives?)/i,
    /in (space|underwater)/i,
  ];

  for (const pattern of phrasePatterns) {
    if (pattern.test(normalizedPrompt)) {
      return {
        isValid: false,
        error: 'Your request goes beyond professional profile photo enhancements. Please focus on subtle improvements like lighting, background, or attire.',
      };
    }
  }

  if (normalizedPrompt.length < 10) {
    return {
      isValid: false,
      error: 'Please provide a more detailed description of the enhancements you would like (at least 10 characters).',
    };
  }

  const requiredThemes = [
    'lighting', 'light', 'bright', 'dark', 'shadow', 'sunlight', 'glow', 'warm', 'cool', 'soft',
    'background', 'backdrop', 'setting', 'environment', 'scene', 'ambiance', 'surroundings', 'location', 'room', 'office', 'outdoor', 'indoor',
    'clothing', 'attire', 'outfit', 'shirt', 'jacket', 'dress', 'suit', 'top', 'style', 'look', 'fashion', 'wear',
    'professional', 'polished', 'refined', 'elegant', 'sophisticated', 'clean', 'crisp', 'natural', 'minimal',
    'color', 'tone', 'warmth', 'brightness', 'contrast', 'saturation', 'hue', 'tint', 'palette',
    'blur', 'focus', 'sharp', 'clarity', 'detail', 'depth',
  ];

  const hasAcceptableTheme = requiredThemes.some(theme =>
    normalizedPrompt.includes(theme)
  );

  if (!hasAcceptableTheme) {
    return {
      isValid: false,
      error: 'Please describe enhancements related to lighting, background, clothing, or color adjustments. For example: "warmer lighting with a professional office background".',
    };
  }

  return {
    isValid: true,
  };
}
