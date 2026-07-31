import { describe, it, expect, afterEach, vi } from 'vitest';
import { enhanceImage } from '../imageEnhancement';
import { BUDGET_EXHAUSTED } from '../../constants';

/* The retry loop is the part of this codebase that can cost money by
 * being wrong. A budget rejection that gets retried spends the retry to
 * be told the same thing, and the answer cannot change until tomorrow —
 * so the contract worth pinning is "exactly one fetch". */

const file = () => new File([new Uint8Array(1)], 'portrait.jpg', { type: 'image/jpeg' });

function mockFetchOnce(status: number, body: Record<string, unknown>) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('enhanceImage budget handling', () => {
  it('does not retry a budget rejection', async () => {
    const fetchMock = mockFetchOnce(503, {
      error: 'The atelier is fully booked today. Please return tomorrow.',
      code: BUDGET_EXHAUSTED,
    });

    const result = await enhanceImage(file(), 'warmer lighting');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.code).toBe(BUDGET_EXHAUSTED);
  });

  it('surfaces the capacity message in the app voice, not a raw error', async () => {
    mockFetchOnce(503, { error: 'ignored', code: BUDGET_EXHAUSTED });

    const result = await enhanceImage(file(), 'warmer lighting');

    expect(result.error).toBe('The atelier is fully booked today. Please return tomorrow.');
  });

  it('still retries an ordinary upstream failure', async () => {
    const fetchMock = mockFetchOnce(502, { error: 'upstream', code: 'UPSTREAM_ERROR' });

    const result = await enhanceImage(file(), 'warmer lighting');

    // Two attempts total — the budget path must not have disabled retry
    // for everything else.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
  }, 10_000);

  it('returns the image on a successful first attempt', async () => {
    const fetchMock = mockFetchOnce(200, { enhanced_image_url: 'data:image/png;base64,AAAA' });

    const result = await enhanceImage(file(), 'warmer lighting');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.enhancedImageUrl).toBe('data:image/png;base64,AAAA');
  });
});
