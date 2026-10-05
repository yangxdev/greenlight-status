import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { healthSlice } from '../features/health/healthSlice.ts';
import { projectSlice } from '../features/project/projectSlice.ts';
import { sessionSlice } from '../features/session/sessionSlice.ts';
import { statusSlice } from '../features/status/statusSlice.ts';

// Add every new slice here; combineSlices infers RootState from them.
export const rootReducer = combineSlices(healthSlice, statusSlice, projectSlice, sessionSlice);

export type RootState = ReturnType<typeof rootReducer>;

/** Factory function so tests can build an isolated store with preloaded state. */
export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({ reducer: rootReducer, preloadedState });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
