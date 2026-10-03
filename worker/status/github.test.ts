import { describe, expect, it } from 'vitest';
import { buildStatus } from './github.ts';
import { API, baseRoutes, fakeGithub, json, RAW, TABLE } from './fixtures.ts';

const env = {};

describe('buildStatus', () => {
  it('AC7: requests only valid critic files, newest first', async () => {
    const routes = baseRoutes();
    routes[`${API}/contents/analysis`] = json([
      { name: '2026-10-01-critic.md' },
      { name: '2026-10-02-critic.md' },
      { name: 'notes.md' },
      { name: '../x-critic.md' },
    ]);
    routes[`${RAW}/analysis/2026-10-01-critic.md`] = new Response(TABLE);
    const { fetchImpl, calls } = fakeGithub(routes);
    const status = await buildStatus(env, fetchImpl);
    expect(status.runs.map((r) => r.date)).toEqual(['2026-10-02', '2026-10-01']);
    const critic = calls.filter((c) => c.url.includes('critic'));
    expect(critic).toHaveLength(2);
    expect(status.runs[0]?.url).toBe(
      'https://github.com/yangxdev/greenlight/blob/main/analysis/2026-10-02-critic.md',
    );
  });

  it('AC8: reads at most the 12 newest critic files', async () => {
    const routes = baseRoutes();
    const names = Array.from(
      { length: 15 },
      (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}-critic.md`,
    );
    routes[`${API}/contents/analysis`] = json(names.map((name) => ({ name })));
    for (const name of names) routes[`${RAW}/analysis/${name}`] = new Response(TABLE);
    const { fetchImpl, calls } = fakeGithub(routes);
    const status = await buildStatus(env, fetchImpl);
    expect(calls.filter((c) => c.url.includes('-critic.md'))).toHaveLength(12);
    expect(status.runs).toHaveLength(12);
    expect(status.runs[0]?.file).toBe('2026-09-15-critic.md');
  });

  it('AC9: a failing critic file only drops itself', async () => {
    const routes = baseRoutes();
    routes[`${API}/contents/analysis`] = json([
      { name: '2026-10-02-critic.md' },
      { name: '2026-10-03-critic.md' },
    ]);
    routes[`${RAW}/analysis/2026-10-03-critic.md`] = new Response('boom', { status: 500 });
    const { fetchImpl } = fakeGithub(routes);
    const status = await buildStatus(env, fetchImpl);
    expect(status.runs.map((r) => r.date)).toEqual(['2026-10-02']);
  });

  describe('AC10: live links and verdicts', () => {
    const live = (homepage: unknown, marker = true) => {
      const routes = baseRoutes();
      routes[`${API}/issues?state=all&per_page=100`] = json([
        {
          number: 9,
          title: '[idea] Shipped',
          state: 'open',
          labels: [{ name: 'live' }],
          html_url: 'https://github.com/yangxdev/greenlight/issues/9',
        },
      ]);
      routes[`${API}/issues/9/comments?per_page=100`] = json(
        marker ? [{ body: '<!-- greenlight:repo=yangxdev/shipped -->' }] : [],
      );
      routes['https://api.github.com/repos/yangxdev/shipped/'] = json({ homepage });
      routes[`${API}/contents/reports`] = json([
        { name: '2026-W39.json' },
        { name: '2026-W40.json' },
      ]);
      routes[`${RAW}/reports/2026-W40.json`] = json({
        week: '2026-W40',
        summary: 'ok',
        products: [{ issue: 9, verdict: 'improve', reason: 'slow' }],
      });
      return fakeGithub(routes).fetchImpl;
    };

    it('uses an https homepage and joins the report', async () => {
      const status = await buildStatus(env, live('https://x.workers.dev'));
      expect(status.live).toEqual([
        {
          issue: 9,
          name: 'Shipped',
          issueUrl: 'https://github.com/yangxdev/greenlight/issues/9',
          liveUrl: 'https://x.workers.dev',
          verdict: 'improve',
          reason: 'slow',
        },
      ]);
      expect(status.report).toEqual({ week: '2026-W40', summary: 'ok' });
    });

    it('gives null for unsafe, empty or missing homepages', async () => {
      for (const fetchImpl of [live('javascript:alert(1)'), live(''), live('https://x', false)]) {
        const status = await buildStatus(env, fetchImpl);
        expect(status.live[0]?.liveUrl).toBeNull();
        expect(status.live[0]?.verdict).toBe('improve');
      }
    });
  });

  it('AC11: missing watchlist and report are fine; failing issues reject', async () => {
    const { fetchImpl } = fakeGithub(baseRoutes());
    const status = await buildStatus(env, fetchImpl);
    expect(status.watchlist).toEqual([]);
    expect(status.report).toBeNull();
    expect(status.watchlistUrl).toBe(
      'https://github.com/yangxdev/greenlight/blob/main/analysis/watchlist.md',
    );

    const routes = baseRoutes();
    routes[`${API}/issues?state=all&per_page=100`] = new Response('no', { status: 500 });
    await expect(buildStatus(env, fakeGithub(routes).fetchImpl)).rejects.toThrow();
  });

  it('falls back to the default repo when SOURCE_REPO is malformed', async () => {
    const { fetchImpl } = fakeGithub(baseRoutes());
    const status = await buildStatus({ SOURCE_REPO: 'not a repo' }, fetchImpl);
    expect(status.sourceRepo).toBe('yangxdev/greenlight');
  });
});
