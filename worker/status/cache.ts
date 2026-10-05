import type { ProjectDetail, StatusResponse } from '../../shared/api.ts';
import type { Env } from '../env.ts';
import { errorResponse } from '../router.ts';
import { buildProject, NotFoundError } from './detail.ts';
import { buildStatus, type FetchLike } from './github.ts';

/** The board: about 20 GitHub requests per rebuild, so with the read token five minutes is far inside the limit. */
export const CACHE_MS = 5 * 60 * 1000;
/** One project's detail: four requests, read when someone opens it. */
export const PROJECT_CACHE_MS = 60 * 1000;
const MAX_PROJECTS_CACHED = 50;
const UNAVAILABLE = 'GitHub is not answering right now. Try again in a few minutes.';
const HEADERS = { 'cache-control': 'no-store' };

let cached: { data: StatusResponse; at: number } | null = null;
let inflight: Promise<StatusResponse> | null = null;
const projects = new Map<number, { data: ProjectDetail; at: number }>();

export function resetStatusCache(): void {
  cached = null;
  inflight = null;
  projects.clear();
}

/** After a write: the next read rebuilds, but the old copy still covers a GitHub failure. */
export function invalidate(number?: number): void {
  if (cached) cached.at = Number.NEGATIVE_INFINITY;
  if (number !== undefined) projects.delete(number);
}

/** The board document: fresh if under CACHE_MS old, else rebuilt; on failure the last good copy, marked stale. */
export async function loadStatus(
  env: Env,
  now: () => number = Date.now,
  fetchImpl?: FetchLike,
): Promise<StatusResponse> {
  if (cached && now() - cached.at < CACHE_MS) return { ...cached.data, stale: false };
  inflight ??= buildStatus(env, fetchImpl).finally(() => {
    inflight = null;
  });
  try {
    const data = await inflight;
    const fresh = { ...data, fetchedAt: new Date(now()).toISOString(), stale: false };
    cached = { data: fresh, at: now() };
    return fresh;
  } catch (error) {
    console.error('status build failed', error);
    if (cached) return { ...cached.data, stale: true };
    throw error;
  }
}

export async function getStatus(
  env: Env,
  now: () => number = Date.now,
  fetchImpl?: FetchLike,
): Promise<Response> {
  try {
    return Response.json(await loadStatus(env, now, fetchImpl), { headers: HEADERS });
  } catch {
    return errorResponse(503, UNAVAILABLE, HEADERS);
  }
}

export async function getProject(
  env: Env,
  number: number,
  now: () => number = Date.now,
  fetchImpl?: FetchLike,
): Promise<Response> {
  const hit = projects.get(number);
  if (hit && now() - hit.at < PROJECT_CACHE_MS)
    return Response.json(hit.data, { headers: HEADERS });
  try {
    // The board's copy supplies the verdict and score; without it the detail still works.
    const status = await loadStatus(env, now, fetchImpl).catch(() => null);
    const data = await buildProject(env, number, status, fetchImpl);
    if (projects.size >= MAX_PROJECTS_CACHED) projects.clear();
    projects.set(number, { data, at: now() });
    return Response.json(data, { headers: HEADERS });
  } catch (error) {
    if (error instanceof NotFoundError)
      return errorResponse(404, 'No idea issue with that number.');
    console.error('project build failed', error);
    if (hit) return Response.json(hit.data, { headers: HEADERS });
    return errorResponse(503, UNAVAILABLE, HEADERS);
  }
}
