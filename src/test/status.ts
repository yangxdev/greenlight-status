import type { StatusResponse } from '../../shared/api.ts';

/** A minimal, valid status document for tests; override what the test cares about. */
export function makeStatus(overrides: Partial<StatusResponse> = {}): StatusResponse {
  return {
    sourceRepo: 'yangxdev/greenlight',
    fetchedAt: '2026-10-03T10:00:00.000Z',
    stale: false,
    filedThreshold: 14,
    ideas: [],
    runs: [],
    watchlist: [],
    watchlistUrl: 'https://github.com/yangxdev/greenlight/blob/main/analysis/watchlist.md',
    report: null,
    live: [],
    ...overrides,
  };
}
