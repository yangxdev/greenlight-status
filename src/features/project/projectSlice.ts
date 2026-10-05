import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type {
  NewChange,
  NewIdea,
  NewIdeaResponse,
  ProjectAction,
  ProjectDetail,
} from '../../../shared/api.ts';
import { apiGet, apiPost } from '../../lib/api.ts';
import { fetchStatus } from '../status/statusSlice.ts';

export interface ProjectEntry {
  status: 'loading' | 'ready' | 'error';
  data: ProjectDetail | null;
  error: string | null;
}

export type ProjectState = Record<number, ProjectEntry>;

export const fetchProject = createAsyncThunk('project/fetch', (number: number) =>
  apiGet<ProjectDetail>(`/projects/${number}`),
);

/**
 * A gate, a retry or archive, then both views reread so the new labels show. It settles only once the project is
 * reread, so its button never comes back for the state it just left.
 */
export const runAction = createAsyncThunk(
  'project/action',
  async ({ number, action }: { number: number; action: ProjectAction }, { dispatch }) => {
    await apiPost(`/projects/${number}/actions`, { action });
    void dispatch(fetchStatus());
    await dispatch(fetchProject(number));
  },
);

export const addComment = createAsyncThunk(
  'project/comment',
  async ({ number, body }: { number: number; body: string }, { dispatch }) => {
    await apiPost(`/projects/${number}/comments`, { body });
    await dispatch(fetchProject(number));
  },
);

/** A change to a live product, filed under it; then the product and the board reread. */
export const createChange = createAsyncThunk(
  'project/createChange',
  async ({ parent, change }: { parent: number; change: NewChange }, { dispatch }) => {
    const created = await apiPost<NewIdeaResponse>(`/projects/${parent}/changes`, change);
    void dispatch(fetchProject(parent));
    void dispatch(fetchStatus());
    return created;
  },
);

export const createIdea = createAsyncThunk(
  'project/create',
  async (idea: NewIdea, { dispatch }) => {
    const created = await apiPost<NewIdeaResponse>('/ideas', idea);
    void dispatch(fetchStatus());
    return created;
  },
);

export const projectSlice = createSlice({
  name: 'project',
  initialState: {} as ProjectState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProject.pending, (state, action) => {
        const entry = state[action.meta.arg];
        // Keep the old copy on screen while rereading.
        state[action.meta.arg] = { status: 'loading', data: entry?.data ?? null, error: null };
      })
      .addCase(fetchProject.fulfilled, (state, action) => {
        state[action.meta.arg] = { status: 'ready', data: action.payload, error: null };
      })
      .addCase(fetchProject.rejected, (state, action) => {
        const entry = state[action.meta.arg];
        state[action.meta.arg] = {
          status: 'error',
          data: entry?.data ?? null,
          error: action.error.message ?? 'Unknown error',
        };
      });
  },
});

export const selectProject = (state: { project: ProjectState }, number: number) =>
  state.project[number];
