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

  describe('projects from issues and the repo-wide comment feed', () => {
    const COMMENTS = `${API}/issues/comments?sort=created&direction=desc&per_page=100&page=1`;
    const routes = () => {
      const r = baseRoutes();
      r[`${API}/issues?state=all&per_page=100`] = json([
        {
          number: 9,
          title: '[idea] Shipped',
          state: 'open',
          labels: [{ name: 'live' }],
          html_url: 'https://github.com/yangxdev/greenlight/issues/9',
          user: { login: 'yangxdev' },
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-02T00:00:00Z',
        },
      ]);
      // Newest first, as the endpoint sends them.
      r[COMMENTS] = json([
        {
          issue_url: `${API}/issues/9`,
          body: '**Publisher:** live at https://a.workers.dev\n<!-- greenlight:url=https://a.workers.dev -->',
          created_at: '2026-10-01T03:00:00Z',
          author_association: 'OWNER',
          user: { login: 'yangxdev' },
          html_url: 'https://github.com/c/3',
        },
        {
          issue_url: `${API}/issues/9`,
          body: '**Architect:** ready\n<!-- greenlight:repo=yangxdev/shipped -->',
          created_at: '2026-10-01T01:00:00Z',
          author_association: 'NONE',
          user: { login: 'github-actions[bot]' },
          html_url: 'https://github.com/c/1',
        },
      ]);
      r[`${API}/actions/runs?per_page=100`] = json({
        workflow_runs: [
          {
            path: '.github/workflows/scout.yml',
            status: 'completed',
            conclusion: 'success',
            created_at: '2026-10-02T06:00:00Z',
            html_url: 'https://github.com/run/2',
            display_title: 'Scout',
          },
          {
            path: '.github/workflows/architect.yml',
            status: 'completed',
            conclusion: 'skipped',
            created_at: '2026-10-02T05:00:00Z',
            html_url: 'https://github.com/run/1',
            display_title: 'Architect',
          },
        ],
      });
      r[`${API}/contents/reports`] = json([{ name: '2026-W39.json' }, { name: '2026-W40.json' }]);
      r[`${RAW}/reports/2026-W40.json`] = json({
        week: '2026-W40',
        summary: 'ok',
        products: [{ issue: 9, verdict: 'improve', reason: 'slow' }],
      });
      return r;
    };

    it('takes links from markers, joins the newest report, and marks the stages reached', async () => {
      const status = await buildStatus(env, fakeGithub(routes()).fetchImpl);
      const project = status.projects[0];
      expect(project).toMatchObject({
        number: 9,
        name: 'Shipped',
        source: 'person',
        productRepo: 'yangxdev/shipped',
        liveUrl: 'https://a.workers.dev',
        verdict: 'improve',
        reason: 'slow',
        attention: null,
        current: 'observer',
      });
      expect(project?.steps.find((s) => s.stage === 'publisher')?.status).toBe('done');
      expect(project?.steps.find((s) => s.stage === 'scout')?.status).toBe('skipped');
      expect(status.report).toEqual({ week: '2026-W40', summary: 'ok' });
    });

    it('builds the stage strip from workflow runs and, for product-repo stages, from comments', async () => {
      const status = await buildStatus(env, fakeGithub(routes()).fetchImpl);
      expect(status.stages.map((s) => s.id)).toHaveLength(10);
      const scout = status.stages.find((s) => s.id === 'scout');
      expect(scout?.runs).toEqual([
        {
          at: '2026-10-02T06:00:00Z',
          status: 'success',
          title: 'Scout',
          url: 'https://github.com/run/2',
        },
      ]);
      // A skipped run is a label the workflow ignored, not activity.
      expect(status.stages.find((s) => s.id === 'architect')?.runs).toEqual([]);
      expect(status.stages.find((s) => s.id === 'publisher')?.runs[0]).toMatchObject({
        title: '#9 Shipped',
        status: 'success',
        url: 'https://github.com/c/3',
      });
    });

    it('still builds when the comment feed and the runs fail', async () => {
      const r = routes();
      r[COMMENTS] = new Response('x', { status: 500 });
      r[`${API}/actions/runs?per_page=100`] = new Response('x', { status: 500 });
      const status = await buildStatus(env, fakeGithub(r).fetchImpl);
      expect(status.projects[0]?.liveUrl).toBeNull();
      expect(status.stages.every((s) => s.runs.length === 0)).toBe(true);
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
