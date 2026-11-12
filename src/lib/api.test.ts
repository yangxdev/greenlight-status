import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet, REQUEST_TIMEOUT_MS } from './api.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('apiGet', () => {
  it('fails with a message instead of waiting forever when the server never answers', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const request = apiGet('/status');
    const outcome = expect(request).rejects.toEqual(
      new ApiError(0, 'The server took too long to answer. Try again.'),
    );
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await outcome;
  });

  it('returns the body when the server answers in time', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ok: true }));
    await expect(apiGet('/health')).resolves.toEqual({ ok: true });
  });
});
