import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import {
  IDEA_STATES,
  type CriticRow,
  type IdeaState,
  type StatusResponse,
} from '../../../shared/api.ts';
import { apiGet } from '../../lib/api.ts';

export interface StatusState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: StatusResponse | null;
  error: string | null;
}

const initialState: StatusState = { status: 'idle', data: null, error: null };

export const fetchStatus = createAsyncThunk('status/fetch', () =>
  apiGet<StatusResponse>('/status'),
);

export const statusSlice = createSlice({
  name: 'status',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchStatus.pending, (state) => {
        // Keep the old data while refetching.
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchStatus.fulfilled, (state, action) => {
        state.status = 'ready';
        state.data = action.payload;
        state.error = null;
      })
      .addCase(fetchStatus.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.error.message ?? 'Unknown error';
      });
  },
});

interface WithStatus {
  status: StatusState;
}

export const selectStatus = (state: WithStatus) => state.status;

export interface StateCount {
  state: IdeaState;
  count: number;
}

export const selectStateCounts = createSelector(
  [(state: WithStatus) => state.status.data?.ideas],
  (ideas): StateCount[] =>
    IDEA_STATES.map((name) => ({
      state: name,
      count: (ideas ?? []).filter((idea) => idea.states.includes(name)).length,
    })),
);

export interface LatestRun {
  date: string;
  file: string;
  url: string;
  scored: number;
  filed: number;
  rejected: number;
}

/** A row is filed when its total reaches the threshold. Derived here, never stored. */
export const selectFiled = (row: Pick<CriticRow, 'total'>, threshold: number) =>
  row.total >= threshold;

export const selectLatestRun = createSelector(
  [(state: WithStatus) => state.status.data],
  (data): LatestRun | null => {
    const run = data?.runs[0];
    if (!data || !run) return null;
    const filed = run.rows.filter((row) => selectFiled(row, data.filedThreshold)).length;
    return {
      date: run.date,
      file: run.file,
      url: run.url,
      scored: run.rows.length,
      filed,
      rejected: run.rows.length - filed,
    };
  },
);
