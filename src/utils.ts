const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/* The download link used to hardcode `.jpg` while the generator returns
 * PNG, so the last thing a user touched — the saved file — carried the
 * wrong extension. Read the type off the actual blob instead of
 * guessing, and fall back rather than inventing an odd subtype like
 * `svg+xml`. */
export function extensionForMimeType(mimeType: string | undefined, fallback = 'jpg'): string {
  if (!mimeType) return fallback;

  const normalized = mimeType.split(';')[0].trim().toLowerCase();
  const known = MIME_EXTENSIONS[normalized];
  if (known) return known;

  const subtype = normalized.split('/')[1] ?? '';
  return /^[a-z0-9]+$/.test(subtype) ? subtype : fallback;
}
