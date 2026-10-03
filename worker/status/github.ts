import type { CriticRun, LiveProduct, StatusResponse } from '../../shared/api.ts';
import type { Env } from '../env.ts';
import {
  findRepoMarker,
  parseCriticTable,
  parseIdeaIssues,
  parseReport,
  parseWatchlist,
  type ParsedReport,
} from './parse.ts';

export const DEFAULT_REPO = 'yangxdev/greenlight';
export const FILED_THRESHOLD = 14;
const MAX_CRITIC_FILES = 12;
const CRITIC_FILE = /^(\d{4}-\d{2}-\d{2})-critic\.md$/;
const REPORT_FILE = /^\d{4}-W\d{2}\.json$/;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

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

/** Reads the public Greenlight repo and assembles one status document. Rejects if the core requests fail. */
export async function buildStatus(
  env: Pick<Env, 'SOURCE_REPO' | 'GITHUB_READ_TOKEN'>,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<StatusResponse> {
  const repo = resolveRepo(env);
  const api = `https://api.github.com/repos/${repo}`;
  const raw = `https://raw.githubusercontent.com/${repo}/main`;
  const blob = `https://github.com/${repo}/blob/main`;

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

  const [issuesJson, analysisJson, reportsJson] = await Promise.all([
    getJson(`${api}/issues?state=all&per_page=100`),
    getJson(`${api}/contents/analysis`),
    attempt(() => getJson(`${api}/contents/reports`)),
  ]);
  const ideas = parseIdeaIssues(issuesJson, repo);

  const criticFiles = listNames(analysisJson)
    .filter((name) => CRITIC_FILE.test(name))
    .sort()
    .reverse()
    .slice(0, MAX_CRITIC_FILES);
  const reportFile = listNames(reportsJson)
    .filter((name) => REPORT_FILE.test(name))
    .sort()
    .reverse()[0];

  const [runResults, watchText, report] = await Promise.all([
    Promise.all(
      criticFiles.map(async (file): Promise<CriticRun | null> => {
        const text = await attempt(() => getText(`${raw}/analysis/${file}`));
        if (text === null) return null;
        const rows = parseCriticTable(text);
        if (rows.length === 0) return null;
        const date = CRITIC_FILE.exec(file)?.[1] ?? '';
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

  const live: LiveProduct[] = await Promise.all(
    ideas
      .filter((idea) => idea.states.includes('live'))
      .map(async (idea): Promise<LiveProduct> => {
        const entry = report?.products.find((p) => p.issue === idea.number);
        const liveUrl = await attempt(async () => {
          const productRepo = findRepoMarker(
            await getJson(`${api}/issues/${idea.number}/comments?per_page=100`),
          );
          if (!productRepo) return null;
          const info = await getJson(`https://api.github.com/repos/${productRepo}/`);
          const homepage =
            typeof info === 'object' && info !== null && 'homepage' in info
              ? (info as { homepage: unknown }).homepage
              : null;
          return typeof homepage === 'string' && homepage.startsWith('https://') ? homepage : null;
        });
        return {
          issue: idea.number,
          name: idea.name,
          issueUrl: idea.url,
          liveUrl,
          verdict: entry?.verdict ?? null,
          reason: entry ? entry.reason : null,
        };
      }),
  );

  return {
    sourceRepo: repo,
    fetchedAt: new Date().toISOString(),
    stale: false,
    filedThreshold: FILED_THRESHOLD,
    ideas,
    runs,
    watchlist: watchText === null ? [] : parseWatchlist(watchText),
    watchlistUrl: `${blob}/analysis/watchlist.md`,
    report: report ? { week: report.week, summary: report.summary } : null,
    live,
  };
}
