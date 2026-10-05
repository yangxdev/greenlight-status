import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { MeResponse } from '../../../shared/api.ts';
import { apiGet, apiPost } from '../../lib/api.ts';

export interface SessionState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  me: MeResponse;
}

const ANONYMOUS: MeResponse = { signInAvailable: false, login: null, owner: false };
const initialState: SessionState = { status: 'idle', me: ANONYMOUS };

export const fetchMe = createAsyncThunk('session/me', () => apiGet<MeResponse>('/me'));

export const signOut = createAsyncThunk('session/signOut', () => apiPost('/auth/logout'));

export const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMe.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.status = 'ready';
        state.me = action.payload;
      })
      // Without /api/me the dashboard is simply read-only.
      .addCase(fetchMe.rejected, (state) => {
        state.status = 'error';
        state.me = ANONYMOUS;
      })
      .addCase(signOut.fulfilled, (state) => {
        state.me = { ...state.me, login: null, owner: false };
      });
  },
});

export const selectMe = (state: { session: SessionState }) => state.session.me;
