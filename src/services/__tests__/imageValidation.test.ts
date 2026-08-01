import { describe, it, expect } from 'vitest';
import { validateCustomPrompt } from '../imageValidation';

describe('validateCustomPrompt', () => {
  it('allows normal lighting/background prompts', () => {
    expect(validateCustomPrompt('Softer lighting with a blurred neutral background').isValid).toBe(true);
    expect(validateCustomPrompt('Crisp natural light, clean white wall').isValid).toBe(true);
  });

  it('blocks prohibited subjects', () => {
    expect(validateCustomPrompt('put me on a dragon').isValid).toBe(false);
    expect(validateCustomPrompt('make me look naked').isValid).toBe(false);
    expect(validateCustomPrompt('anime style portrait').isValid).toBe(false);
  });

  it('handles empty and long input without throwing', () => {
    expect(() => validateCustomPrompt('')).not.toThrow();
    expect(() => validateCustomPrompt('light '.repeat(100))).not.toThrow();
  });
});

/* These cover the two defects that replaced isAllowedPhrase's offset
 * arithmetic. Both classes were false REJECTIONS of legitimate prompts,
 * which is the expensive direction here: the server re-validates anyway,
 * so a client that wrongly blocks is turning a working request into a
 * dead end for no protection at all. */
describe('validateCustomPrompt — negation handling', () => {
  it('allows a negated keyword regardless of the phrasing used', () => {
    // "no sexy" used to be rescued only because it was a literal entry in
    // an allowedPhrases list; "not sexy" was not, and was rejected.
    expect(validateCustomPrompt('no sexy poses, keep it professional').isValid).toBe(true);
    expect(validateCustomPrompt('professional headshot, not sexy').isValid).toBe(true);
    expect(validateCustomPrompt('warm lighting, not sexy, professional background').isValid).toBe(true);
  });

  it('allows several negated keywords across clauses', () => {
    expect(validateCustomPrompt('no sexy poses and no sultry lighting').isValid).toBe(true);
  });

  it('blocks when a later occurrence is not negated', () => {
    // The offset window only ever examined the first occurrence via
    // indexOf, so an opening "no sexy" cleared everything after it.
    expect(validateCustomPrompt('no sexy lighting and sexy pose').isValid).toBe(false);
    expect(validateCustomPrompt('no sexy lighting, make the pose sexy').isValid).toBe(false);
    expect(validateCustomPrompt('no sexy poses, but make the pose sexy').isValid).toBe(false);
  });

  it('blocks an un-negated keyword', () => {
    expect(validateCustomPrompt('sexy lighting and a bright background').isValid).toBe(false);
    expect(validateCustomPrompt('make the lighting seductive and warm').isValid).toBe(false);
  });
});

describe('validateCustomPrompt — word boundaries', () => {
  it('does not trip on prohibited words embedded in innocent ones', () => {
    // Plain substring matching rejected these. 'dead' inside "deadline",
    // 'joint' inside "jointly".
    expect(validateCustomPrompt('meet the deadline look, crisp lighting').isValid).toBe(true);
    expect(validateCustomPrompt('jointly lit from both sides, soft shadows').isValid).toBe(true);
  });

  it('still blocks the same words standing alone', () => {
    expect(validateCustomPrompt('dead eyes stare, moody lighting').isValid).toBe(false);
    expect(validateCustomPrompt('roll a joint, warm lighting').isValid).toBe(false);
  });
});
