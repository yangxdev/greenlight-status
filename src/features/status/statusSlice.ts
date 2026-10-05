import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { CriticRow, StatusResponse } from '../../../shared/api.ts';
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

/** A row is filed when its total reaches the threshold. Derived here, never stored. */
export const selectFiled = (row: Pick<CriticRow, 'total'>, threshold: number) =>
  row.total >= threshold;
