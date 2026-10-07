import { USAGE_WINDOW_DAYS, type CriticRun, type StatusResponse } from '../../shared/api.ts';
import type { Env } from '../env.ts';
import {
  parseCriticTable,
  parseIdeaIssues,
  parseReport,
  parseWatchlist,
  type ParsedReport,
} from './parse.ts';
import {
  attachChanges,
  commentEvents,
  parseComments,
  summarizeProject,
  type IssueComment,
} from './project.ts';
import { buildStages, parseWorkflowRuns } from './runs.ts';
import { sumUsage } from './usage.ts';

export const DEFAULT_REPO = 'yangxdev/greenlight';
export const FILED_THRESHOLD = 14;
const MAX_CRITIC_FILES = 12;
/** Pages of 100 of the repo's newest comments: enough for every recent project's stage comments. */
export const COMMENT_PAGES = 3;
const CRITIC_FILE = /^(\d{4}-\d{2}-\d{2})-critic\.md$/;
const REPORT_FILE = /^\d{4}-W\d{2}\.json$/;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function resolveRepo(env: Pick<Env, 'SOURCE_REPO'>): string {
  const repo = env.SOURCE_REPO;
  return typeof repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : DEFAULT_REPO;
}

function listNames(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  const names: string[] = [];
  for (const entry of json as unknown[]) {
    if (typeof entry === 'object' && entry !== null && 'name' in entry) {
      const { name } = entry as { name: unknown };
      if (typeof name === 'string') names.push(name);
    }
  }
  return names;
}

/** GET helpers that send the read token to api.github.com only, and turn a non-2xx answer into an error. */
export function githubReader(
  env: Pick<Env, 'GITHUB_READ_TOKEN'>,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
) {
  const request = (url: string): Promise<Response> => {
    const headers: Record<string, string> = { 'user-agent': 'greenlight-status' };
    if (env.GITHUB_READ_TOKEN && new URL(url).hostname === 'api.github.com') {
      headers.authorization = `Bearer ${env.GITHUB_READ_TOKEN}`;
    }
    return fetchImpl(url, { headers });
  };
  const getJson = async (url: string): Promise<unknown> => {
    const res = await request(url);
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return res.json();
  };
  const getText = async (url: string): Promise<string> => {
    const res = await request(url);
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return res.text();
  };
  const attempt = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch {
      return null;
    }
  };
  return { getJson, getText, attempt };
}

/** The repo's newest comments, oldest first, read a page at a time until a short page or COMMENT_PAGES. */
async function recentComments(
  getJson: (url: string) => Promise<unknown>,
  api: string,
): Promise<IssueComment[]> {
  const all: IssueComment[] = [];
  for (let page = 1; page <= COMMENT_PAGES; page++) {
    const json = await getJson(
      `${api}/issues/comments?sort=created&direction=desc&per_page=100&page=${page}`,
    );
    all.push(...parseComments(json));
    if (!Array.isArray(json) || json.length < 100) break;
  }
  return all.reverse();
}

/** Reads the public Greenlight repo and assembles one status document. Rejects if the core requests fail. */
export async function buildStatus(
  env: Pick<Env, 'SOURCE_REPO' | 'GITHUB_READ_TOKEN'>,
  fetchImpl?: FetchLike,
): Promise<StatusResponse> {
  const repo = resolveRepo(env);
  const api = `https://api.github.com/repos/${repo}`;
  const raw = `https://raw.githubusercontent.com/${repo}/main`;
  const blob = `https://github.com/${repo}/blob/main`;
  const { getJson, getText, attempt } = githubReader(env, fetchImpl);

  const [issuesJson, analysisJson, reportsJson, comments, runsJson] = await Promise.all([
    getJson(`${api}/issues?state=all&per_page=100`),
    getJson(`${api}/contents/analysis`),
    attempt(() => getJson(`${api}/contents/reports`)),
    attempt(() => recentComments(getJson, api)),
    attempt(() => getJson(`${api}/actions/runs?per_page=100`)),
  ]);
  const issues = parseIdeaIssues(issuesJson, repo);

  const criticFiles = listNames(analysisJson)
    .filter((name) => CRITIC_FILE.test(name))
    .sort()
    .reverse()
    .slice(0, MAX_CRITIC_FILES);
  const reportFile = listNames(reportsJson)
    .filter((name) => REPORT_FILE.test(name))
    .sort()
    .reverse()[0];

  const now = new Date();
  const usageSince = new Date(now.getTime() - USAGE_WINDOW_DAYS * 86_400_000).toISOString();
  // The Analyst's and Critic's usage sits at the end of each week's review file, even when the Critic failed.
  const usageTexts: string[] = [];

  const [runResults, watchText, report] = await Promise.all([
    Promise.all(
      criticFiles.map(async (file): Promise<CriticRun | null> => {
        const text = await attempt(() => getText(`${raw}/analysis/${file}`));
        if (text === null) return null;
        const date = CRITIC_FILE.exec(file)?.[1] ?? '';
        if (date >= usageSince.slice(0, 10)) usageTexts.push(text);
        const rows = parseCriticTable(text);
        if (rows.length === 0) return null;
        return { date, file, url: `${blob}/analysis/${file}`, rows };
      }),
    ),
    attempt(() => getText(`${raw}/analysis/watchlist.md`)),
    reportFile
      ? attempt(async (): Promise<ParsedReport | null> =>
          parseReport(await getJson(`${raw}/reports/${reportFile}`)),
        )
      : Promise.resolve(null),
  ]);
  const runs = runResults.filter((run): run is CriticRun => run !== null);

  const byIssue = new Map<number, IssueComment[]>();
  for (const c of comments ?? []) {
    const list = byIssue.get(c.issue) ?? [];
    list.push(c);
    byIssue.set(c.issue, list);
  }
  const projects = attachChanges(
    issues.map((issue) =>
      summarizeProject(issue, byIssue.get(issue.number) ?? [], runs, report?.products ?? []),
    ),
  );
  const stageEvents = issues.flatMap((issue) =>
    (byIssue.get(issue.number) ?? [])
      .flatMap(commentEvents)
      .map((event) => ({ project: issue, event })),
  );

  // Every trusted comment the board read, not only the ideas': the Observer reports on its own tracking issue.
  for (const c of comments ?? []) if (c.trusted && c.at >= usageSince) usageTexts.push(c.body);

  return {
    sourceRepo: repo,
    fetchedAt: now.toISOString(),
    stale: false,
    filedThreshold: FILED_THRESHOLD,
    stages: buildStages(parseWorkflowRuns(runsJson), stageEvents, repo, sumUsage(usageTexts)),
    usageSince,
    projects,
    runs,
    watchlist: watchText === null ? [] : parseWatchlist(watchText),
    watchlistUrl: `${blob}/analysis/watchlist.md`,
    report: report ? { week: report.week, summary: report.summary } : null,
  };
}
