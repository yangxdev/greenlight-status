import { describe, expect, it, vi } from 'vitest';
import type { PipelineIdea } from '../../../shared/api.ts';
import { makeStore } from '../../app/store.ts';
import { makeStatus } from '../../test/status.ts';
import {
  fetchStatus,
  selectFiled,
  selectLatestRun,
  selectStateCounts,
  statusSlice,
} from './statusSlice.ts';

const idea = (n: number, states: PipelineIdea['states']): PipelineIdea => ({
  number: n,
  name: `Idea ${n}`,
  states,
  url: `https://github.com/yangxdev/greenlight/issues/${n}`,
});

const row = (name: string, total: number) => ({
  name,
  pain: 1,
  competition: 1,
  mvp: 1,
  reach: 1,
  total,
  verdict: '',
});

describe('selectors', () => {
  it('AC16: counts per state in pipeline order', () => {
    const data = makeStatus({
      ideas: [idea(1, ['idea']), idea(2, ['idea']), idea(3, ['live']), idea(4, ['live', 'stuck'])],
    });
    const store = makeStore({ status: { status: 'ready', data, error: null } });
    const counts = selectStateCounts(store.getState());
    expect(counts.map((c) => c.state)).toEqual([
      'idea',
      'approved',
      'blueprint-ready',
      'blueprint-ok',
      'building',
      'live',
      'stuck',
      'archived',
    ]);
    expect(Object.fromEntries(counts.map((c) => [c.state, c.count]))).toMatchObject({
      idea: 2,
      live: 2,
      stuck: 1,
      approved: 0,
      archived: 0,
    });
  });

  it('AC17: latest run counts filed and rejected by threshold', () => {
    const runs = [
      {
        date: '2026-10-02',
        file: '2026-10-02-critic.md',
        url: 'u',
        rows: [row('a', 15), row('b', 14), row('c', 13), row('d', 9)],
      },
    ];
    const withRuns = makeStore({
      status: { status: 'ready', data: makeStatus({ runs }), error: null },
    });
    expect(selectLatestRun(withRuns.getState())).toMatchObject({
      date: '2026-10-02',
      scored: 4,
      filed: 2,
      rejected: 2,
    });
    expect(selectLatestRun(makeStore().getState())).toBeNull();
    expect(selectFiled(row('x', 14), 14)).toBe(true);
    expect(selectFiled(row('x', 13), 14)).toBe(false);
  });
});

describe('statusSlice', () => {
  it('stores data when fetchStatus succeeds', async () => {
    const data = makeStatus();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(data));
    const store = makeStore();
    await store.dispatch(fetchStatus());
    expect(store.getState().status).toMatchObject({ status: 'ready', data, error: null });
  });

  it('AC18: keeps data when a later fetch is rejected', () => {
    const data = makeStatus();
    const ready = statusSlice.reducer(undefined, fetchStatus.fulfilled(data, 'r1'));
    const loading = statusSlice.reducer(ready, fetchStatus.pending('r2'));
    expect(loading).toMatchObject({ status: 'loading', data });
    const failed = statusSlice.reducer(
      loading,
      fetchStatus.rejected(new Error('GitHub is down'), 'r2'),
    );
    expect(failed).toMatchObject({ status: 'error', data, error: 'GitHub is down' });
  });

  it('surfaces the server message from a 503', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: 'try later' }, { status: 503 }),
    );
    const store = makeStore();
    await store.dispatch(fetchStatus());
    expect(store.getState().status).toMatchObject({
      status: 'error',
      data: null,
      error: 'try later',
    });
  });
});
