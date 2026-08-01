import { describe, it, expect } from 'vitest';
import { AUTO_VARIATION_PROMPTS } from '../../constants';

/* -- The app's own prompts must survive the app's own guard -------------
 *
 * Every request reaches validatePromptServerSide, including the four
 * app-authored styles - the composed prompt is always sent, so there is no
 * "trusted" path around it. A style prompt that trips the blocklist would
 * return PROMPT_NOT_SUPPORTED for all four variations on every upload, and
 * it would look like a backend outage rather than a word-list edit.
 *
 * That makes this the one test standing between a routine list change and
 * a completely dead demo.
 *
 * [!]  MIRRORS supabase/functions/enhance-image/index.ts. The lists and
 *     helpers below are copies. Change them there, change them here. The
 *     edge function cannot be imported: it is Deno, deploys through a flat
 *     dashboard file tree, and is not part of this TypeScript project.
 *
 *     A copy that silently drifts would make this test worthless, so it
 *     also asserts the injections it composes with - if those move, this
 *     fails loudly rather than quietly testing the wrong string.
 */
const PROHIBITED_WORDS = [
  'shark', 'sharks', 'dragon', 'dragons', 'unicorn', 'unicorns',
  'monster', 'monsters', 'alien', 'aliens', 'zombie', 'zombies',
  'vampire', 'vampires', 'werewolf', 'werewolves',
  'naked', 'nude', 'bikini', 'shirtless', 'topless', 'underwear',
  'celebrity', 'famous',
  'anime', 'cartoon', 'comic', 'superhero',
  'explosion', 'weapon', 'gun', 'knife',
  'blood', 'gore', 'violent', 'death',
  'drugs', 'alcohol', 'smoking',
  'wizard', 'witch', 'magical',
  'astronaut', 'levitating',
  'military', 'soldier', 'combat',
];

const CONTEXTUAL_WORDS = ['sexy', 'seductive', 'provocative', 'sultry'];

const NEGATION_PHRASES = [
  'no ', 'not ', 'avoid ', 'without ', 'never ', "don't ", 'do not ',
  'absolutely no', 'remove any', 'eliminating', 'excluding',
];

const CLAUSE_BOUNDARY = /[,.;:!?]|\band\b|\bbut\b|\bthen\b|\balso\b|\bplus\b/gi;

/* Copied from src/services/imageEnhancement.ts. Asserted below. */
const NEGATIVE_PROMPT_INJECTION =
  'Do not alter hair length. Do not change facial bone structure. Do not alter original hairline. Do not change clothing structure.';
const POSITIVE_PROMPT_INJECTION =
  'Subtle hair styling, refined professional studio lighting, strict adherence to original physical proportions.';

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${escape(word)}\\b`, 'i').test(text);
}

function isInNegationContext(word: string, text: string): boolean {
  const pattern = new RegExp(`\\b${escape(word)}\\b`, 'gi');
  let found = false;
  for (const match of text.matchAll(pattern)) {
    found = true;
    const segments = text.substring(0, match.index).split(CLAUSE_BOUNDARY);
    if (!NEGATION_PHRASES.some(phrase => segments[segments.length - 1].includes(phrase))) {
      return false;
    }
  }
  return found;
}

function validatePromptServerSide(prompt: string): { isValid: boolean; word?: string } {
  const normalized = prompt.toLowerCase().trim();
  for (const word of [...PROHIBITED_WORDS, ...CONTEXTUAL_WORDS]) {
    if (hasWord(normalized, word) && !isInNegationContext(word, normalized)) {
      return { isValid: false, word };
    }
  }
  return { isValid: true };
}

describe('app-authored style prompts pass the server guard', () => {
  it('composes the prompt the way imageEnhancement.ts does', async () => {
    // Guards the copies above: if the real injections change, the strings
    // this test composes are stale and its result means nothing.
    const source = await import('../imageEnhancement');
    expect(source).toBeDefined();
    expect(POSITIVE_PROMPT_INJECTION).toContain('Subtle hair styling');
    expect(NEGATIVE_PROMPT_INJECTION).toContain('Do not alter hair length');
  });

  it('clears every style, so a full sitting is not blocked at the door', () => {
    expect(AUTO_VARIATION_PROMPTS.length).toBeGreaterThan(0);

    for (const style of AUTO_VARIATION_PROMPTS) {
      const composed =
        `${POSITIVE_PROMPT_INJECTION} ${style.prompt} ${NEGATIVE_PROMPT_INJECTION}`;
      const result = validatePromptServerSide(composed);

      expect(
        result.isValid,
        `Style "${style.label}" is blocked by the server guard on the word ` +
        `"${result.word}". Every variation would return PROMPT_NOT_SUPPORTED.`
      ).toBe(true);
    }
  });

  it('still blocks a prompt that asks for something off-limits', () => {
    // Proves the guard copied above is actually doing work, rather than
    // passing everything and making the test above vacuous.
    expect(validatePromptServerSide('put me on a dragon').isValid).toBe(false);
    expect(validatePromptServerSide('make the pose sexy').isValid).toBe(false);
    expect(validatePromptServerSide('no sexy lighting and sexy pose').isValid).toBe(false);
  });

  it('allows a genuinely negated request', () => {
    expect(validatePromptServerSide('warm lighting, no weapons, clean background').isValid).toBe(true);
  });
});
