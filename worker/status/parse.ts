import {
  IDEA_STATES,
  type CriticRow,
  type IdeaState,
  type Verdict,
  type WatchEntry,
} from '../../shared/api.ts';

const PREFIXES = { idea: '[idea] ', change: '[change] ' } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isState(value: string): value is IdeaState {
  return (IDEA_STATES as readonly string[]).includes(value);
}

/** An idea or change issue as the board needs it, before its comments are read. */
export interface IdeaIssue {
  number: number;
  kind: 'idea' | 'change';
  /** For a change: its product's idea issue, if it says which. */
  parent: number | null;
  /** Title without the "[idea] " or "[change] " prefix. */
  name: string;
  states: IdeaState[];
  url: string;
  closed: boolean;
  author: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A change's product issue: the sub-issue parent if the API says, else the dashboard's and Observer's marker, else the
 * Change form's "Product issue" field. The same order the Architect uses.
 */
export function findParent(item: Record<string, unknown>): number | null {
  const fromUrl = /\/issues\/(\d+)$/.exec(
    typeof item.parent_issue_url === 'string' ? item.parent_issue_url : '',
  )?.[1];
  if (fromUrl) return Number(fromUrl);
  const body = typeof item.body === 'string' ? item.body : '';
  const marker = /greenlight:parent=(\d+)/.exec(body)?.[1];
  if (marker) return Number(marker);
  const field = /^###\s+Product issue\s*\n+[^\n#]*#(\d+)/m.exec(body)?.[1];
  return field ? Number(field) : null;
}

export function parseIdeaIssues(json: unknown, repo: string): IdeaIssue[] {
  if (!Array.isArray(json)) return [];
  const ideas: IdeaIssue[] = [];
  for (const item of json as unknown[]) {
    if (!isRecord(item) || 'pull_request' in item) continue;
    const { number, title, state, labels, html_url: htmlUrl, user } = item;
    const { created_at: createdAt, updated_at: updatedAt } = item;
    if (typeof number !== 'number' || typeof title !== 'string') continue;
    const kind = title.startsWith(PREFIXES.idea)
      ? 'idea'
      : title.startsWith(PREFIXES.change)
        ? 'change'
        : null;
    if (!kind) continue;
    const found = new Set<IdeaState>();
    if (Array.isArray(labels)) {
      for (const label of labels as unknown[]) {
        const name = typeof label === 'string' ? label : isRecord(label) ? label.name : undefined;
        if (typeof name === 'string' && isState(name)) found.add(name);
      }
    }
    let states: IdeaState[] = IDEA_STATES.filter((s) => found.has(s));
    if (states.length === 0) states = [state === 'closed' ? 'archived' : 'idea'];
    const parent = kind === 'change' ? findParent(item) : null;
    ideas.push({
      number,
      kind,
      parent: parent === number ? null : parent,
      name: title.slice(PREFIXES[kind].length).trim(),
      states,
      url: typeof htmlUrl === 'string' ? htmlUrl : `https://github.com/${repo}/issues/${number}`,
      closed: state === 'closed',
      author: isRecord(user) && typeof user.login === 'string' ? user.login : '',
      createdAt: typeof createdAt === 'string' ? createdAt : '',
      updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
    });
  }
  return ideas;
}

const clean = (text: string) => text.replace(/\*\*/g, '').replace(/`/g, '').trim();

function splitRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  let body = trimmed.slice(1);
  if (body.endsWith('|')) body = body.slice(0, -1);
  return body.split('|').map(clean);
}

const isSeparator = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));

function leadingInt(text: string): number | null {
  const m = /^(\d+)/.exec(text.trim());
  return m?.[1] !== undefined ? Number(m[1]) : null;
}

const SCORE_HEADERS = ['pain', 'competition', 'mvp', 'reach', 'total'] as const;

export function parseCriticTable(markdown: unknown): CriticRow[] {
  if (typeof markdown !== 'string') return [];
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    const header = splitRow(lines[i] ?? '');
    const sep = splitRow(lines[i + 1] ?? '');
    if (!header || !sep || !isSeparator(sep)) continue;
    const names = header.map((h) => h.toLowerCase());
    const scoreCols = SCORE_HEADERS.map((h) => names.indexOf(h));
    const nameCol = names.includes('name') ? names.indexOf('name') : names.indexOf('idea');
    if (scoreCols.includes(-1) || nameCol === -1) continue;
    const verdictCol = names.indexOf('verdict');
    const rows: CriticRow[] = [];
    for (let j = i + 2; j < lines.length; j++) {
      const cells = splitRow(lines[j] ?? '');
      if (!cells) break;
      const nums = scoreCols.map((c) => leadingInt(cells[c] ?? ''));
      const name = cells[nameCol] ?? '';
      if (!name || nums.some((n) => n === null)) continue;
      const [pain = 0, competition = 0, mvp = 0, reach = 0, total = 0] = nums as number[];
      rows.push({
        name,
        pain,
        competition,
        mvp,
        reach,
        total,
        verdict: verdictCol === -1 ? '' : (cells[verdictCol] ?? ''),
      });
    }
    return rows;
  }
  return [];
}

export function parseWatchlist(markdown: unknown): WatchEntry[] {
  if (typeof markdown !== 'string') return [];
  const entries: WatchEntry[] = [];
  let current: WatchEntry | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading?.[1] !== undefined) {
      current = {
        name: clean(heading[1]),
        bestScore: null,
        bestScoreDate: null,
        lastEvidence: '',
        problem: '',
        needs: '',
      };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const bullet = /^\s*[-*]\s+\*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(line);
    if (!bullet?.[1]) continue;
    const label = bullet[1].toLowerCase();
    const value = (bullet[2] ?? '').trim();
    if (label.includes('best')) {
      current.bestScore = leadingInt(value);
      current.bestScoreDate = /\b(\d{4}-\d{2}-\d{2})\b/.exec(value)?.[1] ?? null;
    } else if (label.includes('evidence')) current.lastEvidence = value;
    else if (label.includes('problem')) current.problem = value;
    else if (label.includes('need')) current.needs = value;
  }
  return entries;
}

export interface ReportProduct {
  issue: number;
  verdict: Verdict;
  reason: string;
}

export interface ParsedReport {
  week: string;
  summary: string;
  products: ReportProduct[];
}

export function parseReport(json: unknown): ParsedReport | null {
  if (!isRecord(json)) return null;
  const { week, summary, products } = json;
  if (typeof week !== 'string' || typeof summary !== 'string') return null;
  const out: ReportProduct[] = [];
  if (Array.isArray(products)) {
    for (const p of products as unknown[]) {
      if (!isRecord(p)) continue;
      const { issue, verdict, reason } = p;
      if (typeof issue !== 'number') continue;
      if (verdict !== 'keep' && verdict !== 'improve' && verdict !== 'archive') continue;
      out.push({ issue, verdict, reason: typeof reason === 'string' ? reason : '' });
    }
  }
  return { week, summary, products: out };
}
