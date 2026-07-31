import { describe, it, expect } from 'vitest';
import { isHeicFile } from '../imageEnhancement';

const fileOf = (name: string, type: string) => new File([new Uint8Array(1)], name, { type });

describe('isHeicFile', () => {
  it('detects HEIC/HEIF by mime type', () => {
    expect(isHeicFile(fileOf('portrait.heic', 'image/heic'))).toBe(true);
    expect(isHeicFile(fileOf('portrait.heif', 'image/heif'))).toBe(true);
  });

  it('detects HEIC by extension when iOS reports an empty type', () => {
    expect(isHeicFile(fileOf('IMG_0421.HEIC', ''))).toBe(true);
    expect(isHeicFile(fileOf('IMG_0421.heif', ''))).toBe(true);
  });

  it('leaves ordinary images alone', () => {
    expect(isHeicFile(fileOf('portrait.jpg', 'image/jpeg'))).toBe(false);
    expect(isHeicFile(fileOf('portrait.png', 'image/png'))).toBe(false);
    // An empty type on a non-HEIC name must not be dragged through the
    // converter — that would fail on a perfectly good JPEG.
    expect(isHeicFile(fileOf('portrait.jpg', ''))).toBe(false);
  });
});
