import {
  STAGES,
  type Attention,
  type ChangeSummary,
  type CriticRun,
  type ProjectEvent,
  type ProjectStep,
  type ProjectSummary,
  type RunStatus,
  type StageId,
  type StepStatus,
} from '../../shared/api.ts';
import type { IdeaIssue, ReportProduct } from './parse.ts';

/** A comment on an issue of the pipeline repo, from the per-issue or the repo-wide comments endpoint. */
export interface IssueComment {
  issue: number;
  at: string;
  author: string;
  /**
   * Written by the workflows' bot or by someone with write access. Anyone can comment on a public issue, so only
   * these comments may move a project's stages or set its links.
   */
  trusted: boolean;
  body: string;
  url: string;
}

const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const BOT = 'github-actions[bot]';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Comments in API order. Malformed entries drop themselves. */
export function parseComments(json: unknown): IssueComment[] {
  if (!Array.isArray(json)) return [];
  const out: IssueComment[] = [];
  for (const item of json as unknown[]) {
    if (!isRecord(item)) continue;
    const { body, created_at: at, html_url: url, issue_url: issueUrl, user } = item;
    const association = item.author_association;
    if (typeof body !== 'string' || typeof at !== 'string') continue;
    const issue =
      typeof issueUrl === 'string' ? Number(/\/issues\/(\d+)$/.exec(issueUrl)?.[1]) : NaN;
    const author = isRecord(user) && typeof user.login === 'string' ? user.login : '';
    out.push({
      issue: Number.isInteger(issue) ? issue : 0,
      at,
      author,
      trusted:
        author === BOT ||
        (typeof association === 'string' && TRUSTED_ASSOCIATIONS.has(association)),
      body,
      url: typeof url === 'string' ? url : '',
    });
  }
  return out;
}

/** "📐 **Architect:**", "🏭 **Factory (fix):**", "📊 **Observer, 2026-W40:**": the actor prefix every stage comment starts with. */
const ACTOR =
  /\*\*(Architect|Reviewer|Factory dispatch|Factory(?: \([^)*]*\))?|Inspector|Publisher|Observer(?:, [^:*]+)?):\*\*/g;

function actorStage(name: string): StageId {
  if (name.startsWith('Factory')) return 'factory';
  if (name.startsWith('Observer')) return 'observer';
  return name.toLowerCase() as StageId;
}

/** Strip HTML comments (the machine markers) and emoji, which the house style keeps out of the interface. */
export function cleanText(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * One comment as events: a trusted comment is cut at the start of each line that carries an actor marker (the
 * Architect's comment also holds the Reviewer's verdict). Anything else is one discussion event.
 */
export function commentEvents(comment: IssueComment): ProjectEvent[] {
  const base = { at: comment.at, author: comment.author, url: comment.url };
  const starts: { index: number; stage: StageId }[] = [];
  if (comment.trusted) {
    for (const m of comment.body.matchAll(ACTOR)) {
      const lineStart = comment.body.lastIndexOf('\n', m.index) + 1;
      if (starts.at(-1)?.index === lineStart) continue;
      starts.push({ index: lineStart, stage: actorStage(m[1] ?? '') });
    }
  }
  if (starts.length === 0) return [{ ...base, stage: null, text: cleanText(comment.body) }];
  return starts.map((start, i) => ({
    ...base,
    stage: start.stage,
    text: cleanText(comment.body.slice(i === 0 ? 0 : start.index, starts[i + 1]?.index)),
  }));
}

const FAILED = /\b(failed|needs a human|did not finish|no product repo|broke)\b/i;
const BUSY = /another build is in progress/i;

/** What a stage comment says about its run. */
export function eventStatus(text: string): RunStatus {
  if (BUSY.test(text)) return 'cancelled';
  return FAILED.test(text) ? 'failure' : 'success';
}

const REPO_MARKER = /<!--\s*greenlight:repo=([\w.-]+\/[\w.-]+)\s*-->/g;
const URL_MARKER = /<!--\s*greenlight:url=(https:\/\/[^\s<>"']+?)\s*-->/g;

/** The last marker of a kind in trusted comments: a re-run's marker replaces the earlier one. */
export function lastMarker(comments: IssueComment[], kind: 'repo' | 'url'): string | null {
  const re = kind === 'repo' ? REPO_MARKER : URL_MARKER;
  let found: string | null = null;
  for (const c of comments) {
    if (!c.trusted) continue;
    for (const m of c.body.matchAll(re)) found = m[1] ?? found;
  }
  return found;
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const ORDER = STAGES.map((s) => s.id);
const at = (id: StageId) => ORDER.indexOf(id);

/**
 * Where one project stands at each of the ten stages, from its state labels and its trusted stage comments.
 * Comments say what happened; the labels say what is happening now, and win where they disagree.
 */
export function deriveSteps(
  issue: Pick<IdeaIssue, 'states' | 'author' | 'createdAt'> & { kind?: IdeaIssue['kind'] },
  events: ProjectEvent[],
): { steps: ProjectStep[]; current: StageId; attention: Attention | null } {
  const last = new Map<StageId, ProjectEvent>();
  for (const e of events) if (e.stage) last.set(e.stage, e);

  const change = issue.kind === 'change';
  // A change skips the idea stages (it comes from you or the Observer) and the weekly report (its product has one).
  const fromCritic = issue.author === BOT && !change;
  const steps: ProjectStep[] = STAGES.map(({ id }) => {
    if (change && id === 'observer') return { stage: id, status: 'skipped', at: null };
    if (id === 'scout' || id === 'analyst' || id === 'critic') {
      return fromCritic
        ? { stage: id, status: 'done', at: issue.createdAt }
        : { stage: id, status: 'skipped', at: null };
    }
    if (id === 'board') return { stage: id, status: 'done', at: issue.createdAt };
    const event = last.get(id);
    return event
      ? {
          stage: id,
          status: eventStatus(event.text) === 'failure' ? 'stuck' : 'done',
          at: event.at,
        }
      : { stage: id, status: 'pending', at: null };
  });
  const set = (id: StageId, status: StepStatus) => {
    const step = steps[at(id)];
    if (step) step.status = status;
  };

  const has = (state: string) => (issue.states as readonly string[]).includes(state);
  // A failure comment only counts while the project is stuck; a later success clears it.
  if (!has('stuck')) for (const s of steps) if (s.status === 'stuck') s.status = 'done';

  let active: StageId | null = null;
  let attention: Attention | null = null;
  if (has('stuck')) {
    // The newest stage that reported is the one that gave up.
    const latest = events.filter((e) => e.stage).at(-1)?.stage ?? 'board';
    active = latest;
    set(latest, 'stuck');
    attention = 'stuck';
  } else if (has('archived')) {
    active = null;
  } else if (has('shipped')) {
    set('publisher', 'done');
    active = null;
  } else if (has('live')) {
    set('publisher', 'done');
    if (last.has('observer')) set('observer', 'done');
    else set('observer', 'running');
    active = last.has('observer') ? null : 'observer';
  } else if (has('building') || has('blueprint-ok')) {
    const factory = last.get('factory');
    const inspector = last.get('inspector');
    // The Factory opened or updated a PR after the Inspector's last word: the Inspector is up.
    const reviewing =
      factory &&
      /\bPR opened\b|fix round/i.test(factory.text) &&
      (!inspector || inspector.at < factory.at);
    active = reviewing ? 'inspector' : 'factory';
    set(active, 'running');
  } else if (has('blueprint-ready')) {
    set('architect', 'done');
    set('reviewer', 'waiting');
    active = 'reviewer';
    attention = 'blueprint-ok';
  } else if (has('approved')) {
    active = 'architect';
    set('architect', 'running');
  } else if (has('idea')) {
    active = 'board';
    set('board', 'waiting');
    attention = 'approve';
  }

  // A re-run starts over from the active stage: older results after it are history, not progress.
  if (active) {
    for (const s of steps.slice(at(active) + 1)) if (s.status !== 'skipped') s.status = 'pending';
  }
  // Everything before the active stage happened, even when a comment is missing (older than the comments read).
  if (active) {
    for (const s of steps.slice(at('board'), at(active)))
      if (s.status === 'pending') s.status = 'done';
  }

  const current =
    active ??
    [...steps].reverse().find((s) => s.status === 'done' && at(s.stage) >= at('board'))?.stage ??
    'board';
  return { steps, current, attention };
}

/** One project for the board. `comments` are this issue's, oldest first; they may be incomplete. */
export function summarizeProject(
  issue: IdeaIssue,
  comments: IssueComment[],
  runs: CriticRun[],
  report: ReportProduct[],
): ProjectSummary {
  if (issue.kind === 'change') {
    runs = [];
    report = [];
  }
  const events = comments.flatMap(commentEvents);
  const { steps, current, attention } = deriveSteps(issue, events);
  const verdict = report.find((p) => p.issue === issue.number) ?? null;
  const key = slug(issue.name);
  let score: ProjectSummary['score'] = null;
  for (const run of runs) {
    const row = run.rows.find((r) => slug(r.name) === key);
    if (row) {
      score = { total: row.total, date: run.date, url: run.url };
      break;
    }
  }
  return {
    number: issue.number,
    kind: issue.kind,
    parent: issue.parent,
    name: issue.name,
    url: issue.url,
    states: issue.states,
    closed: issue.closed,
    source: issue.author === BOT ? 'critic' : 'person',
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    steps,
    current,
    attention,
    productRepo: lastMarker(comments, 'repo'),
    liveUrl: lastMarker(comments, 'url'),
    verdict: verdict?.verdict ?? null,
    reason: verdict ? verdict.reason : null,
    score,
    changes: [],
  };
}

export function toChangeSummary(p: ProjectSummary): ChangeSummary {
  return {
    number: p.number,
    name: p.name,
    url: p.url,
    states: p.states,
    closed: p.closed,
    current: p.current,
    attention: p.closed ? null : p.attention,
    updatedAt: p.updatedAt,
  };
}

/**
 * Ideas with their changes attached. A change whose product isn't among the ideas read (older than the issues read,
 * or naming no product) is left out of the board; it still has its own page.
 */
export function attachChanges(all: ProjectSummary[]): ProjectSummary[] {
  const ideas = all.filter((p) => p.kind === 'idea');
  const byNumber = new Map(ideas.map((p) => [p.number, p]));
  for (const p of all) {
    if (p.kind !== 'change' || p.parent === null) continue;
    byNumber.get(p.parent)?.changes.push(toChangeSummary(p));
  }
  for (const idea of ideas) {
    idea.changes.sort(
      (a, b) => Number(a.closed) - Number(b.closed) || (a.number < b.number ? 1 : -1),
    );
  }
  return ideas;
}
