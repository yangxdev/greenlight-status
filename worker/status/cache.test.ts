// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { StatusResponse } from '../../shared/api.ts';
import type { Env } from '../env.ts';
import { getStatus, resetStatusCache } from './cache.ts';
import { API, baseRoutes, fakeGithub } from './fixtures.ts';

const env = {} as Env;
const START = Date.parse('2026-10-03T10:00:00Z');

beforeEach(() => resetStatusCache());

describe('getStatus', () => {
  it('AC12: serves the second call within 10 minutes from the cache', async () => {
    const { fetchImpl, calls } = fakeGithub(baseRoutes());
    const first = await getStatus(env, () => START, fetchImpl);
    const used = calls.length;
    const second = await getStatus(env, () => START + 9 * 60 * 1000, fetchImpl);
    expect(calls).toHaveLength(used);
    const body = (await second.json()) as StatusResponse;
    expect(body.stale).toBe(false);
    expect(((await first.json()) as StatusResponse).fetchedAt).toBe(body.fetchedAt);
  });

  it('AC13: serves the old copy as stale when GitHub fails after expiry', async () => {
    const routes = baseRoutes();
    const good = fakeGithub(routes);
    await getStatus(env, () => START, good.fetchImpl);
    routes[`${API}/issues?state=all&per_page=100`] = new Response('x', { status: 500 });
    const bad = fakeGithub(routes);
    const res = await getStatus(env, () => START + 11 * 60 * 1000, bad.fetchImpl);
    expect(res.status).toBe(200);
    const body = (await res.json()) as StatusResponse;
    expect(body.stale).toBe(true);
    expect(body.fetchedAt).toBe(new Date(START).toISOString());
    expect(body.ideas).toHaveLength(1);
  });

  it('AC14: answers 503 with a message when nothing is cached', async () => {
    const routes = baseRoutes();
    routes[`${API}/issues?state=all&per_page=100`] = new Response('x', { status: 500 });
    const res = await getStatus(env, () => START, fakeGithub(routes).fetchImpl);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('AC15: concurrent calls read upstream once', async () => {
    const { fetchImpl, calls } = fakeGithub(baseRoutes());
    await Promise.all([
      getStatus(env, () => START, fetchImpl),
      getStatus(env, () => START, fetchImpl),
    ]);
    expect(calls.filter((c) => c.url.includes('/issues?state=all'))).toHaveLength(1);
  });

  it('AC15: sends the token to api.github.com only', async () => {
    const withToken = fakeGithub(baseRoutes());
    await getStatus({ GITHUB_READ_TOKEN: 'tok' } as Env, () => START, withToken.fetchImpl);
    for (const call of withToken.calls) {
      const host = new URL(call.url).hostname;
      expect(call.headers.authorization).toBe(host === 'api.github.com' ? 'Bearer tok' : undefined);
      expect(call.headers['user-agent']).toBe('greenlight-status');
    }
    expect(withToken.calls.some((c) => c.url.includes('raw.githubusercontent.com'))).toBe(true);

    resetStatusCache();
    const without = fakeGithub(baseRoutes());
    await getStatus(env, () => START, without.fetchImpl);
    expect(without.calls.every((c) => c.headers.authorization === undefined)).toBe(true);
  });
});
