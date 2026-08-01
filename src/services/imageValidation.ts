import { BUDGET_EXHAUSTED } from '../constants';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  faceCount?: number;
  needsPersonRemoval?: boolean;
  /* Set only for BUDGET_EXHAUSTED. Callers use it to show the capacity
   * screen rather than the "try another photo" toast. */
  code?: string;
  /* True when validation did not actually run and we let the upload
   * through anyway. `isValid: true` alone cannot distinguish "checked
   * and fine" from "never checked" — which is how a dead validator
   * stayed invisible for months. Callers must not read faceCount or
   * needsPersonRemoval when this is set. */
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
    };
  } catch (error) {
    // Network/connection error — pass through rather than blocking
    console.warn('Validation unreachable, proceeding without validation:', error);
    return { isValid: true, validationSkipped: true };
  }
}

/* Negation vocabulary, matching validatePromptServerSide in
 * supabase/functions/enhance-image/index.ts. The word lists on the two
 * sides differ on purpose - the client's is longer because it is UX
 * guidance and the server's is enforcement - but the *matching semantics*
 * must agree, or the client rejects prompts the server would have run.
 *
 * Known limit, shared with the server: "nothing sultry" and "nor sexy"
 * are not recognised as negations. Adding them here alone would put the
 * two sides out of step, which is the failure this is fixing. */
const NEGATION_PHRASES = [
  'no ', 'not ', 'avoid ', 'without ', 'never ', "don't ", 'do not ',
  'absolutely no', 'remove any', 'eliminating', 'excluding',
];

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

/* A negation only governs its own clause. Scanning a flat window of
 * preceding characters lets one early "no" launder every later use of the
 * word: with a 50-character lookback, "no sexy lighting and sexy pose"
 * reads as fully negated, because the second occurrence can still see the
 * "no " belonging to the first. Cutting at the clause boundary is what
 * makes "no X and X" behave differently from "no X and no X". */
const CLAUSE_BOUNDARY = /[,.;:!?]|\band\b|\bbut\b|\bthen\b|\balso\b|\bplus\b/gi;

/* True only when EVERY occurrence of the word sits in a negation context.
 *
 * Checking every occurrence is the point. The previous implementation
 * located one occurrence with indexOf and compared its offset against an
 * allowed phrase's offset with a magic `< phrase.length + 5` window. That
 * failed in both directions: "no sexy poses, but make the pose sexy" was
 * cleared because only the first occurrence was ever examined, while
 * "professional headshot, not sexy" was rejected because "not sexy" was
 * not one of the literal rescue phrases. Absolute string offsets never
 * encoded the thing being asked - whether the word was being asked for. */
function everyOccurrenceNegated(word: string, text: string): boolean {
  const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  let found = false;

  for (const match of text.matchAll(pattern)) {
    found = true;
    const preceding = text.substring(0, match.index);
    const segments = preceding.split(CLAUSE_BOUNDARY);
    const clause = segments[segments.length - 1];
    if (!NEGATION_PHRASES.some(phrase => clause.includes(phrase))) return false;
  }

  return found;
}

export function validateCustomPrompt(prompt: string): ValidationResult {
  const normalizedPrompt = prompt.toLowerCase().trim();

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

  /* Word boundaries, not substrings. Plain `includes` rejected "more space
   * between me and the background" on 'space', "meet the deadline look" on
   * 'dead', and "jointly lit" on 'joint' - all legitimate prompts, and the
   * first of those is a thing people actually ask for. The server fixed
   * this months ago; the client had been left behind. */
  for (const keyword of prohibitedKeywords) {
    if (hasWord(normalizedPrompt, keyword)) {
      return {
        isValid: false,
        error: 'Your prompt contains content that is not appropriate for professional profile photos. Please focus on lighting, background, and clothing enhancements only.',
      };
    }
  }

  for (const keyword of conditionalKeywords) {
    if (hasWord(normalizedPrompt, keyword) && !everyOccurrenceNegated(keyword, normalizedPrompt)) {
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
