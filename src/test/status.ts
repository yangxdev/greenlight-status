import { vi } from 'vitest';
import {
  STAGES,
  type MeResponse,
  type ProjectDetail,
  type ProjectSummary,
  type StatusResponse,
  type StepStatus,
} from '../../shared/api.ts';

/** A minimal, valid status document for tests; override what the test cares about. */
export function makeStatus(overrides: Partial<StatusResponse> = {}): StatusResponse {
  return {
    sourceRepo: 'yangxdev/greenlight',
    fetchedAt: '2026-10-03T10:00:00.000Z',
    stale: false,
    filedThreshold: 14,
    stages: STAGES.map(({ id }) => ({ id, runs: [], workflowUrl: null })),
    projects: [],
    runs: [],
    watchlist: [],
    watchlistUrl: 'https://github.com/yangxdev/greenlight/blob/main/analysis/watchlist.md',
    report: null,
    ...overrides,
  };
}

/** Steps up to `upTo` done, that one in `status`, the rest pending. */
export function makeSteps(upTo: number, status: StepStatus = 'done') {
  return STAGES.map(({ id }, i) => ({
    stage: id,
    status: i < upTo ? ('done' as const) : i === upTo ? status : ('pending' as const),
    at: i <= upTo ? '2026-10-02T10:00:00.000Z' : null,
  }));
}

export function makeProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    number: 5,
    name: 'greenlight-status',
    url: 'https://github.com/yangxdev/greenlight/issues/5',
    states: ['idea'],
    closed: false,
    source: 'person',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
    steps: makeSteps(3, 'waiting'),
    current: 'board',
    attention: 'approve',
    productRepo: null,
    liveUrl: null,
    verdict: null,
    reason: null,
    score: null,
    ...overrides,
  };
}

export function makeDetail(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    ...makeProject(),
    body: [{ heading: 'Problem', text: 'Nobody reads GitHub.' }],
    events: [],
    pulls: [],
    productRuns: [],
    blueprintUrl: null,
    ...overrides,
  };
}

export const OWNER: MeResponse = { signInAvailable: true, login: 'yangxdev', owner: true };
export const VISITOR: MeResponse = { signInAvailable: true, login: null, owner: false };

/**
 * A fake /api: GETs answer from `routes` by path; POSTs are recorded and answer `posts[path]` or `{ ok: true }`.
 */
export function mockApi(routes: Record<string, unknown>, posts: Record<string, Response> = {}) {
  const sent: { method: string; path: string; body: unknown }[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    if (method !== 'GET') {
      sent.push({
        method,
        path,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      });
      return posts[path]?.clone() ?? Response.json({ ok: true });
    }
    if (path in routes) return Response.json(routes[path]);
    return Response.json({ error: 'not found' }, { status: 404 });
  });
  return { spy, sent };
}
