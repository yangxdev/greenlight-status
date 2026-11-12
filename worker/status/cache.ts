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
/**
 * How long a request waits on a rebuild that another request started before running its own. Workers cancel a
 * request's I/O when that request ends (a reload, a closed tab), and a rebuild started by it then never settles: without
 * this limit every later request on the isolate waited on it forever.
 */
export const SHARED_WAIT_MS = 15_000;
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

class WaitTimeout extends Error {}

function waitAtMost<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WaitTimeout()), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function startBuild(env: Env, fetchImpl?: FetchLike): Promise<StatusResponse> {
  const build: Promise<StatusResponse> = buildStatus(env, fetchImpl).finally(() => {
    if (inflight === build) inflight = null;
  });
  inflight = build;
  return build;
}

/**
 * The board document: fresh if under CACHE_MS old, else rebuilt; on failure the last good copy, marked stale.
 * Requests that arrive during a rebuild share it, but only for SHARED_WAIT_MS: then they run their own.
 */
export async function loadStatus(
  env: Env,
  now: () => number = Date.now,
  fetchImpl?: FetchLike,
): Promise<StatusResponse> {
  if (cached && now() - cached.at < CACHE_MS) return { ...cached.data, stale: false };
  const shared = inflight;
  try {
    // A build this request starts ends by itself (each GitHub call has a time limit); only a shared one can hang.
    const data = shared
      ? await waitAtMost(shared, SHARED_WAIT_MS).catch((error: unknown) => {
          if (!(error instanceof WaitTimeout)) throw error;
          console.warn('status: a shared rebuild did not settle, rebuilding');
          if (inflight === shared) inflight = null;
          return startBuild(env, fetchImpl);
        })
      : await startBuild(env, fetchImpl);
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
