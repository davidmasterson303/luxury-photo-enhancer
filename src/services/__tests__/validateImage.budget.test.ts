import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { validateImageForProfile } from '../imageValidation';
import { BUDGET_EXHAUSTED } from '../../constants';

/* Validation deliberately fails open: an outage must not stop people
 * using the app. Budget exhaustion is the one non-OK response that is a
 * definite answer rather than an outage, so it has to be carved out
 * without weakening the default. */

const file = () => new File([new Uint8Array(1)], 'portrait.jpg', { type: 'image/jpeg' });

function mockResponse(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

beforeEach(() => {
  // The fail-open paths warn by design; that noise is the behaviour under
  // test, and leaving it in the output is how a real failure goes unread.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('validateImageForProfile budget handling', () => {
  it('surfaces budget exhaustion instead of failing open', async () => {
    mockResponse(503, { code: BUDGET_EXHAUSTED, error: 'The atelier is fully booked today.' });

    const result = await validateImageForProfile(file());

    expect(result.code).toBe(BUDGET_EXHAUSTED);
    expect(result.isValid).toBe(false);
  });

  it('still fails open on a genuine service error', async () => {
    mockResponse(500, { error: 'boom' });

    const result = await validateImageForProfile(file());

    expect(result.isValid).toBe(true);
    expect(result.validationSkipped).toBe(true);
    expect(result.code).toBeUndefined();
  });

  it('still fails open when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('not json'); },
    }));

    const result = await validateImageForProfile(file());

    expect(result.isValid).toBe(true);
    expect(result.validationSkipped).toBe(true);
  });

  it('still fails open when the network is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    const result = await validateImageForProfile(file());

    expect(result.isValid).toBe(true);
    expect(result.validationSkipped).toBe(true);
  });
});
