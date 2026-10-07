/**
 * Request/response types shared by the frontend (src/) and the Worker (worker/).
 * Keep this file free of platform types so both sides can import it. The two constant lists below are data, not code.
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
  'shipped',
  'stuck',
  'archived',
] as const;
export type IdeaState = (typeof IDEA_STATES)[number];

/** The pipeline's ten actors, in order. `workflow` is the greenlight workflow whose runs stand for the stage. */
export const STAGES = [
  { id: 'scout', index: '01', name: 'Scout', workflow: 'scout.yml' },
  { id: 'analyst', index: '02', name: 'Analyst', workflow: 'ideas.yml' },
  { id: 'critic', index: '03', name: 'Critic', workflow: 'ideas.yml' },
  { id: 'board', index: '04', name: 'Board', workflow: 'board-sync.yml' },
  { id: 'architect', index: '05', name: 'Architect', workflow: 'architect.yml' },
  { id: 'reviewer', index: '06', name: 'Reviewer', workflow: 'architect.yml' },
  // The next three run in each product's own repo; their activity comes from their comments on the idea issues.
  { id: 'factory', index: '07', name: 'Factory', workflow: null },
  { id: 'inspector', index: '08', name: 'Inspector', workflow: null },
  { id: 'publisher', index: '09', name: 'Publisher', workflow: null },
  { id: 'observer', index: '10', name: 'Observer', workflow: 'observer.yml' },
] as const;
export type StageId = (typeof STAGES)[number]['id'];

export type RunStatus = 'success' | 'failure' | 'running' | 'queued' | 'cancelled';

/** One workflow run, or one stage comment for the stages that run in product repos. */
export interface StageRun {
  at: string;
  status: RunStatus;
  /** The run's title, or "#5 greenlight-status" for a comment. */
  title: string;
  url: string;
}

/**
 * What Claude used, added up over one or more runs. Each AI job of the pipeline records its run in a
 * `<!-- greenlight:usage stage=… in=… out=… cache_read=… cache_write=… turns=… cost=… -->` marker on the comment
 * (or, for the Analyst and Critic, the review file) that reports it. Runs from before the markers have none.
 */
export interface TokenUsage {
  /** Input tokens read fresh, not from the prompt cache. */
  input: number;
  output: number;
  /** Input tokens read back from the prompt cache. */
  cacheRead: number;
  /** Input tokens written to the prompt cache. */
  cacheWrite: number;
  turns: number;
  /** What the same tokens would cost on the API, in US dollars. A subscription doesn't bill this; it shows weight. */
  costUsd: number;
  /** How many Claude runs these figures add up. */
  runs: number;
}

export interface PipelineStage {
  id: StageId;
  /** Newest first, at most 8. Runs a workflow skipped (label events it ignores) are left out. */
  runs: StageRun[];
  /** What the stage's Claude runs used since the status document's `usageSince`, across every project. */
  usage: TokenUsage | null;
  /** The workflow's page on GitHub, or null for the stages that run in product repos. */
  workflowUrl: string | null;
}

/**
 * How far one project got at one stage.
 * waiting: a person is needed (a gate). skipped: the idea was hand-written, so Scout/Analyst/Critic never saw it.
 */
export type StepStatus = 'done' | 'running' | 'waiting' | 'stuck' | 'skipped' | 'pending';

export interface ProjectStep {
  stage: StageId;
  status: StepStatus;
  /** When the stage last reported, if it did. */
  at: string | null;
  /** What this stage's Claude runs used for this project, retries and fix rounds included. */
  usage: TokenUsage | null;
}

/** What the owner is needed for: the two gates, or a stuck project. */
export type Attention = 'approve' | 'blueprint-ok' | 'stuck';

export type Verdict = 'keep' | 'improve' | 'archive';

/** One change to a live product, as its product's tile and page list it. */
export interface ChangeSummary {
  number: number;
  /** Title without the "[change] " prefix. */
  name: string;
  url: string;
  states: IdeaState[];
  closed: boolean;
  current: StageId;
  attention: Attention | null;
  updatedAt: string;
}

export interface ProjectSummary {
  number: number;
  /** An idea (a product) or a change to a live product (a sub-issue of its idea issue). */
  kind: 'idea' | 'change';
  /** For a change: its product's idea issue. */
  parent: number | null;
  /** Title without the "[idea] " or "[change] " prefix. */
  name: string;
  /** Issue html_url. */
  url: string;
  /** 1+, in IDEA_STATES order; "live" and "stuck" may both appear. */
  states: IdeaState[];
  closed: boolean;
  /** Filed by the Critic, or written by a person with the Idea form. */
  source: 'critic' | 'person';
  createdAt: string;
  updatedAt: string;
  /** Ten steps, in STAGES order. */
  steps: ProjectStep[];
  /** The stage that is running, waiting or stuck; else the last one that finished. */
  current: StageId;
  attention: Attention | null;
  /** From the Architect's `greenlight:repo` marker. */
  productRepo: string | null;
  /** From the Publisher's `greenlight:url` marker (https only). */
  liveUrl: string | null;
  verdict: Verdict | null;
  reason: string | null;
  /** The Critic's total for a card with the same name, if one was scored. */
  score: { total: number; date: string; url: string } | null;
  /** For an idea: its changes, open ones first, newest first. Empty for a change. */
  changes: ChangeSummary[];
  /** Every stage's usage for this issue added up (a product's changes count on their own issues). */
  usage: TokenUsage | null;
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

/** How far back the stage strip's usage figures reach. */
export const USAGE_WINDOW_DAYS = 30;

export interface WatchEntry {
  name: string;
  bestScore: number | null;
  bestScoreDate: string | null;
  lastEvidence: string;
  problem: string;
  needs: string;
}

export interface StatusResponse {
  sourceRepo: string;
  /** ISO 8601, when GitHub was last read successfully. */
  fetchedAt: string;
  stale: boolean;
  filedThreshold: number;
  /** Ten entries, in STAGES order. */
  stages: PipelineStage[];
  /** ISO 8601: the start of the stages' usage window (USAGE_WINDOW_DAYS before fetchedAt). */
  usageSince: string;
  /** Ideas only, newest issue first; each carries its changes. */
  projects: ProjectSummary[];
  /** Critic runs, newest first; runs without a valid table are omitted. */
  runs: CriticRun[];
  watchlist: WatchEntry[];
  watchlistUrl: string;
  report: { week: string; summary: string } | null;
}

/** One section of an issue written with the Idea form ("### Problem" and its text). */
export interface IdeaSection {
  heading: string;
  text: string;
}

/** A comment on the idea issue, split at each actor's marker so the Architect's and Reviewer's parts land apart. */
export interface ProjectEvent {
  /** Null for discussion: comments without an actor marker, or from people without write access. */
  stage: StageId | null;
  at: string;
  author: string;
  /** Markdown-ish text with emoji and HTML comments removed. */
  text: string;
  url: string;
}

export interface ProductPull {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  url: string;
  updatedAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  body: IdeaSection[];
  /** Oldest first. */
  events: ProjectEvent[];
  /** The product repo's newest pull requests (the Factory's builds), empty without a repo. */
  pulls: ProductPull[];
  /** The product repo's newest workflow runs (Factory, Inspector, Publisher). */
  productRuns: StageRun[];
  blueprintUrl: string | null;
}

/** GET /api/me */
export interface MeResponse {
  /** False when the Worker has no GitHub App configured: the dashboard is read-only for everyone. */
  signInAvailable: boolean;
  login: string | null;
  /** Signed in as the owner of the pipeline repo: the only person who can write. */
  owner: boolean;
}

/** POST /api/ideas: the Idea form's fields. */
export interface NewIdea {
  title: string;
  problem: string;
  users: string;
  mvp: string;
  competition: string;
  signals: string;
  nongoals: string;
  /** Add `approved` right after filing, which starts the Architect. */
  approve: boolean;
}

export interface NewIdeaResponse {
  number: number;
  url: string;
}

export const NOTE_KINDS = ['Idea', 'Evidence'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

/** POST /api/notes: the Quick note form's fields. */
export interface NewNote {
  kind: NoteKind;
  note: string;
  /** One link per line; may be "". */
  links: string;
}

/** POST /api/projects/:number/changes: a change to that live product, filed as its sub-issue. */
export interface NewChange {
  title: string;
  change: string;
  why: string;
  keep: string;
  /** Add `approved` right after filing, which starts the Architect on it. */
  approve: boolean;
}

/** POST /api/projects/:number/actions */
export type ProjectAction = 'approve' | 'blueprint-ok' | 'retry' | 'archive';

export interface ProjectActionRequest {
  action: ProjectAction;
}

/** POST /api/projects/:number/comments */
export interface CommentRequest {
  body: string;
}
