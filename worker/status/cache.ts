import type { StatusResponse } from '../../shared/api.ts';
import type { Env } from '../env.ts';
import { errorResponse } from '../router.ts';
import { buildStatus } from './github.ts';

export const CACHE_MS = 10 * 60 * 1000;
const UNAVAILABLE = 'GitHub is not answering right now. Try again in a few minutes.';

let cached: { data: StatusResponse; at: number } | null = null;
let inflight: Promise<StatusResponse> | null = null;

export function resetStatusCache(): void {
  cached = null;
  inflight = null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Fresh copy if under 10 minutes old, else rebuild; on failure the last good copy (stale) or a 503. */
export async function getStatus(
  env: Env,
  now: () => number = Date.now,
  fetchImpl?: FetchLike,
): Promise<Response> {
  const headers = { 'cache-control': 'no-store' };
  if (cached && now() - cached.at < CACHE_MS) {
    return Response.json({ ...cached.data, stale: false }, { headers });
  }
  inflight ??= buildStatus(env, fetchImpl).finally(() => {
    inflight = null;
  });
  try {
    const data = await inflight;
    const fresh = { ...data, fetchedAt: new Date(now()).toISOString(), stale: false };
    cached = { data: fresh, at: now() };
    return Response.json(fresh, { headers });
  } catch (error) {
    console.error('status build failed', error);
    if (cached) return Response.json({ ...cached.data, stale: true }, { headers });
    return errorResponse(503, UNAVAILABLE, headers);
  }
}
