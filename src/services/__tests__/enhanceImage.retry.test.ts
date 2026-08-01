import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { enhanceImage } from '../imageEnhancement';

/* -- The retry loop, end to end ----------------------------------------
 *
 * enhanceImage is where the engineering in this repo lives, and it was the
 * least covered thing in it: the prompt validator had tests, the code that
 * spends money did not.
 *
 * Two properties are worth pinning, and they pull against each other.
 * Retrying a transient failure is the whole point of the loop. Retrying a
 * rejection is pure waste - four parallel variations turn one pointless
 * retry into four Gemini calls, which is how a 3-attempt loop once became
 * twelve calls from a single click. So nearly every test here asserts a
 * fetch COUNT, not just an outcome.
 *
 * Fake timers throughout. The backoff is a real 2s+ wait, and a suite that
 * sleeps for it is a suite people stop running. It also lets the delay be
 * asserted directly rather than merely endured. */

const file = () => new File([new Uint8Array(1)], 'portrait.jpg', { type: 'image/jpeg' });

/* Vitest's fake timers make the loop's `await delay(...)` resolvable on
 * demand. runAllTimersAsync drains the microtask queue between timers, so
 * the fetch mock's promises settle in the right order. */
async function runToCompletion<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('enhanceImage — non-retryable codes return immediately', () => {
  /* The API has already rejected the request itself. A second identical
   * call gets the identical answer, one attempt later and one call poorer. */
  it.each(['PROMPT_NOT_SUPPORTED', 'BAD_REQUEST', 'UNAUTHORIZED'])(
    '%s costs exactly one fetch',
    async (code) => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { error: 'nope', code }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await runToCompletion(enhanceImage(file(), 'warmer lighting'));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.code).toBe(code);
    }
  );
});

describe('enhanceImage — transient failures retry', () => {
  it('retries once after a retryable failure and returns the image', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(502, { error: 'upstream', code: 'UPSTREAM_ERROR' }))
      .mockResolvedValueOnce(jsonResponse(200, { enhanced_image_url: 'data:image/png;base64,OK' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runToCompletion(enhanceImage(file(), 'warmer lighting'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.enhancedImageUrl).toBe('data:image/png;base64,OK');
  });

  it('waits before retrying rather than hammering immediately', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(502, { error: 'upstream', code: 'UPSTREAM_ERROR' }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = enhanceImage(file(), 'warmer lighting');

    // Let the first attempt settle without letting the backoff elapse.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Base delay is 2000ms plus up to 1000ms of jitter, so at 1900ms the
    // second attempt cannot have fired yet under any jitter value.
    await vi.advanceTimersByTimeAsync(1_900);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await runToCompletion(pending);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second attempt — never a third', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { error: 'boom', code: 'INTERNAL_ERROR' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runToCompletion(enhanceImage(file(), 'warmer lighting'));

    // MAX_ATTEMPTS is 2 deliberately: this number is multiplied by four
    // parallel variations on every click.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
  });
});

describe('enhanceImage — error mapping', () => {
  it('maps a bare 429 with no body to RATE_LIMITED and the in-voice message', async () => {
    // The edge function rate limiter can reject before it writes a body,
    // so the status alone has to carry the meaning.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runToCompletion(enhanceImage(file(), 'warmer lighting'));

    expect(result.code).toBe('RATE_LIMITED');
    expect(result.error).toBe('The atelier is momentarily busy. Please wait a moment and try again.');
  });

  it('reports a network throw as NETWORK with connection copy', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runToCompletion(enhanceImage(file(), 'warmer lighting'));

    // This is the code path a dead Supabase project produces, which is
    // exactly what the live demo was doing.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
    expect(result.code).toBe('NETWORK');
    expect(result.error).toBe(
      'Could not reach the enhancement service. Check your connection and try again.'
    );
  });

  it('treats a 200 with no enhanced_image_url as a failure', async () => {
    // A success status carrying no image is not a success. Returning
    // success:true here would put a broken <img> in the results grid.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { note: 'nothing useful' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runToCompletion(enhanceImage(file(), 'warmer lighting'));

    expect(result.success).toBe(false);
    expect(result.enhancedImageUrl).toBeUndefined();
  });

  it('prefers the server error string when the code has no friendly message', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { error: 'Prompt too long', code: 'BAD_REQUEST' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runToCompletion(enhanceImage(file(), 'warmer lighting'));

    expect(result.error).toBe('Prompt too long');
  });

  it('falls back to the status when there is neither code nor message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(418, {}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runToCompletion(enhanceImage(file(), 'warmer lighting'));

    expect(result.error).toBe('Enhancement failed (418).');
  });
});

describe('enhanceImage — request shape', () => {
  it('sends the anon key and wraps the prompt in both injections', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { enhanced_image_url: 'data:image/png;base64,OK' }));
    vi.stubGlobal('fetch', fetchMock);

    await runToCompletion(enhanceImage(file(), 'warmer lighting', { people: true, animals: true }));

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    const body = init.body as FormData;

    /* Presence, not value: the anon key comes from import.meta.env, which
     * is unset under test. Asserting the value would only prove the test
     * runner's environment. What matters structurally is that both auth
     * headers are sent and that they agree — Supabase rejects a request
     * carrying one without the other. */
    expect(Object.keys(headers)).toContain('apikey');
    expect(Object.keys(headers)).toContain('Authorization');
    expect(headers.Authorization).toBe(`Bearer ${headers.apikey}`);

    const sentPrompt = body.get('prompt') as string;
    expect(sentPrompt).toContain('Subtle hair styling');
    expect(sentPrompt).toContain('warmer lighting');
    expect(sentPrompt).toContain('Do not alter hair length');
    expect(body.get('needs_person_removal')).toBe('true');
    expect(body.get('needs_animal_removal')).toBe('true');
  });
});

describe('enhanceImage — policy refusals', () => {
  it('does not retry IMAGE_BLOCKED', async () => {
    // A refusal is a verdict on the photo. Retrying costs a second
    // generation call per slot, four slots, for the same answer.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({
        error: 'This photo could not be processed. Please try a different one.',
        code: 'IMAGE_BLOCKED',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runToCompletion(enhanceImage(file(), 'warmer lighting'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.code).toBe('IMAGE_BLOCKED');
    expect(result.error).toBe('This photo could not be processed. Please try a different one.');
  });

  it('still retries NO_IMAGE, which is a transient empty response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(502, { error: 'none', code: 'NO_IMAGE' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runToCompletion(enhanceImage(file(), 'warmer lighting'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.code).toBe('NO_IMAGE');
  });
});

describe('enhanceImage — cleanup flags', () => {
  it('sends both flags false when nothing needs removing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { enhanced_image_url: 'data:image/png;base64,OK' }));
    vi.stubGlobal('fetch', fetchMock);

    await runToCompletion(enhanceImage(file(), 'warmer lighting'));

    const body = fetchMock.mock.calls[0][1].body as FormData;
    // Explicit 'false' rather than omitted: the server reads === "true",
    // so an absent field and a false one behave alike, but a missing field
    // in the log is indistinguishable from a client that forgot to send it.
    expect(body.get('needs_person_removal')).toBe('false');
    expect(body.get('needs_animal_removal')).toBe('false');
  });

  it('sends only the flag that applies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { enhanced_image_url: 'data:image/png;base64,OK' }));
    vi.stubGlobal('fetch', fetchMock);

    await runToCompletion(enhanceImage(file(), 'warmer lighting', { animals: true }));

    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('needs_person_removal')).toBe('false');
    expect(body.get('needs_animal_removal')).toBe('true');
  });
});
