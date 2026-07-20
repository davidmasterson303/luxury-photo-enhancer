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
