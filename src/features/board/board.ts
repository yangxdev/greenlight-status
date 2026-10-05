import {
  STAGES,
  type Attention,
  type ChangeSummary,
  type ProjectSummary,
  type RunStatus,
  type StageId,
  type StepStatus,
} from '../../../shared/api.ts';
import type { StatusTone } from '../../components/ui/index.ts';

export const stageName = (id: StageId) => STAGES.find((s) => s.id === id)?.name ?? id;
export const stageIndex = (id: StageId) => STAGES.find((s) => s.id === id)?.index ?? '';

/** One line per actor: what it does, for the stage drawer. */
export const STAGE_ABOUT: Record<StageId, string> = {
  scout: 'Collects posts where people describe a problem, daily. No AI.',
  analyst: 'Clusters the week’s signals into idea cards.',
  critic:
    'Checks every quote against the sources, scores the cards and files at most three issues.',
  board: 'Every idea is an issue. You approve the ones worth a blueprint.',
  architect: 'Creates the product repo and writes a blueprint of at most ten tasks.',
  reviewer: 'Checks and repairs the blueprint with a fresh context. You start the build.',
  factory: 'Implements the blueprint in the product repo and opens a pull request.',
  inspector:
    'Runs the checks and an AI review, then merges or sends it back, three rounds at most.',
  publisher: 'Deploys to Cloudflare, smoke-tests it and puts the live link in the README. No AI.',
  observer: 'Weekly uptime and visits, with a keep, improve or archive verdict per product.',
};

export const STEP_WORDS: Record<StepStatus, string> = {
  done: 'Done',
  running: 'Running',
  waiting: 'Waiting for you',
  stuck: 'Stuck',
  skipped: 'Skipped',
  pending: 'Not yet',
};

export const STEP_TONE: Record<StepStatus, StatusTone> = {
  done: 'success',
  running: 'active',
  waiting: 'attention',
  stuck: 'danger',
  skipped: 'idle',
  pending: 'idle',
};

export const RUN_TONE: Record<RunStatus, StatusTone> = {
  success: 'success',
  failure: 'danger',
  running: 'active',
  queued: 'idle',
  cancelled: 'warning',
};

export const RUN_WORDS: Record<RunStatus, string> = {
  success: 'Passed',
  failure: 'Failed',
  running: 'Running',
  queued: 'Queued',
  cancelled: 'Cancelled',
};

const GATE_WORDS: Record<Attention, string> = {
  approve: 'approve',
  'blueprint-ok': 'start the build',
  stuck: 'stuck',
};

/** The change that most needs you: stuck first, then a gate. */
export function changeNeedingYou(p: ProjectSummary): ChangeSummary | null {
  return (
    p.changes.find((c) => c.attention === 'stuck') ??
    p.changes.find((c) => c.attention !== null) ??
    null
  );
}

/** One idea or change waiting at a gate, as the stage drawer lists it. */
export interface GateItem {
  number: number;
  name: string;
  /** For a change: its product's name. */
  product: string | null;
  attention: 'approve' | 'blueprint-ok';
}

/** The stage that holds each gate: the Board approves, the Reviewer's blueprint starts the build. */
export const GATE_STAGE: Record<GateItem['attention'], StageId> = {
  approve: 'board',
  'blueprint-ok': 'reviewer',
};

export const GATE_ACTION: Record<GateItem['attention'], string> = {
  approve: 'Approve',
  'blueprint-ok': 'Start the build',
};

/** Ideas and changes waiting for you, grouped by the stage that holds their gate. Archived products are left out. */
export function waitingByStage(
  projects: readonly ProjectSummary[],
): Partial<Record<StageId, GateItem[]>> {
  const out: Partial<Record<StageId, GateItem[]>> = {};
  const add = (item: GateItem) => (out[GATE_STAGE[item.attention]] ??= []).push(item);
  for (const p of projects) {
    if (p.states.includes('archived')) continue;
    if (p.attention === 'approve' || p.attention === 'blueprint-ok') {
      add({ number: p.number, name: p.name, product: null, attention: p.attention });
    }
    for (const c of p.changes) {
      if (c.attention === 'approve' || c.attention === 'blueprint-ok') {
        add({ number: c.number, name: c.name, product: p.name, attention: c.attention });
      }
    }
  }
  return out;
}

/** A project, or one of its changes, needs you. */
export const needsYou = (p: ProjectSummary) => p.attention !== null || changeNeedingYou(p) !== null;

/** What a project is doing, in a few words, with its dot. The accent only where you are needed. */
export function describeProject(p: ProjectSummary): { text: string; tone: StatusTone } {
  const change = p.attention === null ? changeNeedingYou(p) : null;
  if (change && !p.states.includes('archived')) {
    return change.attention === 'stuck'
      ? { text: `Change #${change.number} stuck at ${stageName(change.current)}`, tone: 'danger' }
      : {
          text: `Change #${change.number} waiting for you: ${GATE_WORDS[change.attention ?? 'approve']}`,
          tone: 'attention',
        };
  }
  if (p.attention === 'approve') return { text: 'Waiting for you: approve', tone: 'attention' };
  if (p.attention === 'blueprint-ok') {
    return { text: 'Waiting for you: start the build', tone: 'attention' };
  }
  if (p.attention === 'stuck') return { text: `Stuck at ${stageName(p.current)}`, tone: 'danger' };
  if (p.states.includes('archived')) return { text: 'Archived', tone: 'idle' };
  if (p.states.includes('live')) {
    const building = p.changes.find((c) => !c.closed && c.states.some((s) => s !== 'idea'));
    if (building) return { text: `Live · change #${building.number} in progress`, tone: 'success' };
    return { text: p.verdict ? `Live · ${p.verdict}` : 'Live', tone: 'success' };
  }
  return { text: `${stageName(p.current)} running`, tone: 'active' };
}

export const FILTERS = ['active', 'needs-you', 'building', 'live', 'archived'] as const;
export type Filter = (typeof FILTERS)[number];

export const FILTER_LABELS: Record<Filter, string> = {
  active: 'Active',
  'needs-you': 'Needs you',
  building: 'In progress',
  live: 'Live',
  archived: 'Archived',
};

const archived = (p: ProjectSummary) => p.states.includes('archived');

export function matchesFilter(p: ProjectSummary, filter: Filter): boolean {
  switch (filter) {
    case 'active':
      return !archived(p);
    case 'needs-you':
      return needsYou(p) && !archived(p);
    case 'building':
      return !archived(p) && !p.states.includes('live') && !needsYou(p);
    case 'live':
      return p.states.includes('live') && !archived(p);
    case 'archived':
      return archived(p);
  }
}

export function matchesQuery(p: ProjectSummary, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, '');
  if (!q) return true;
  return p.name.toLowerCase().includes(q) || String(p.number) === q;
}

/** Projects that need you first, then the most recently touched. */
export function sortProjects(projects: readonly ProjectSummary[]): ProjectSummary[] {
  const rank = (p: ProjectSummary) => {
    const attention = p.attention ?? changeNeedingYou(p)?.attention ?? null;
    return attention === 'stuck' ? 0 : attention ? 1 : 2;
  };
  return [...projects].sort(
    (a, b) =>
      rank(a) - rank(b) || (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0),
  );
}
