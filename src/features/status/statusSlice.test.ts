import { describe, expect, it, vi } from 'vitest';
import { makeStore } from '../../app/store.ts';
import { makeStatus } from '../../test/status.ts';
import { fetchStatus, selectFiled, selectStatus } from './statusSlice.ts';

describe('statusSlice', () => {
  it('keeps the last data when a refetch fails, and records the error', async () => {
    const store = makeStore();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(makeStatus()));
    await store.dispatch(fetchStatus());
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({ error: 'GitHub is not answering' }, { status: 503 }),
    );
    await store.dispatch(fetchStatus());
    const state = selectStatus(store.getState());
    expect(state.data?.sourceRepo).toBe('yangxdev/greenlight');
    expect(state.error).toBe('GitHub is not answering');
  });

  it('files a card at the threshold and above', () => {
    expect(selectFiled({ total: 14 }, 14)).toBe(true);
    expect(selectFiled({ total: 13 }, 14)).toBe(false);
  });
});
