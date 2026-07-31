import { describe, it, expect } from 'vitest';
import { extensionForMimeType } from '../utils';

describe('extensionForMimeType', () => {
  it('maps the types the pipeline actually produces', () => {
    // The generator returns PNG; the download link used to say .jpg.
    expect(extensionForMimeType('image/png')).toBe('png');
    expect(extensionForMimeType('image/jpeg')).toBe('jpg');
    expect(extensionForMimeType('image/heic')).toBe('heic');
  });

  it('ignores charset and casing on the mime type', () => {
    expect(extensionForMimeType('IMAGE/PNG')).toBe('png');
    expect(extensionForMimeType('image/png; charset=binary')).toBe('png');
  });

  it('falls back when the type is missing or not a plain subtype', () => {
    expect(extensionForMimeType(undefined)).toBe('jpg');
    expect(extensionForMimeType('')).toBe('jpg');
    expect(extensionForMimeType('image/svg+xml')).toBe('jpg');
    expect(extensionForMimeType(undefined, 'png')).toBe('png');
  });
});
