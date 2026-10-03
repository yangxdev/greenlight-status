/**
 * Request/response types shared by the frontend (src/) and the Worker (worker/).
 * Keep this file free of runtime code and platform types so both sides can import it.
 */
export interface HealthResponse {
  ok: true;
  time: string;
  storage: boolean;
  database: boolean;
}

export const IDEA_STATES = [
  'idea',
  'approved',
  'blueprint-ready',
  'blueprint-ok',
  'building',
  'live',
  'stuck',
  'archived',
] as const;
export type IdeaState = (typeof IDEA_STATES)[number];

export interface PipelineIdea {
  number: number;
  /** Title without the "[idea] " prefix. */
  name: string;
  /** 1+, in IDEA_STATES order; "live" and "stuck" may both appear. */
  states: IdeaState[];
  /** Issue html_url. */
  url: string;
}

export interface CriticRow {
  name: string;
  pain: number;
  competition: number;
  mvp: number;
  reach: number;
  /** Leading integer of "13" or "13/20". */
  total: number;
  /** Free text, may be "". */
  verdict: string;
}

export interface CriticRun {
  /** YYYY-MM-DD, from the file name. */
  date: string;
  /** e.g. 2026-10-02-critic.md */
  file: string;
  url: string;
  rows: CriticRow[];
}

export interface WatchEntry {
  name: string;
  bestScore: number | null;
  bestScoreDate: string | null;
  lastEvidence: string;
  problem: string;
  needs: string;
}

export type Verdict = 'keep' | 'improve' | 'archive';

export interface LiveProduct {
  issue: number;
  name: string;
  issueUrl: string;
  /** Repo homepage (https only); null means link issueUrl instead. */
  liveUrl: string | null;
  verdict: Verdict | null;
  reason: string | null;
}

export interface StatusResponse {
  sourceRepo: string;
  /** ISO 8601, when GitHub was last read successfully. */
  fetchedAt: string;
  stale: boolean;
  filedThreshold: number;
  /** Newest issue first. */
  ideas: PipelineIdea[];
  /** Newest first; runs without a valid table are omitted. */
  runs: CriticRun[];
  watchlist: WatchEntry[];
  watchlistUrl: string;
  report: { week: string; summary: string } | null;
  live: LiveProduct[];
}
