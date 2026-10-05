import type {
  IdeaSection,
  ProductPull,
  ProjectDetail,
  ProjectSummary,
  StatusResponse,
} from '../../shared/api.ts';
import type { Env } from '../env.ts';
import { githubReader, resolveRepo, type FetchLike } from './github.ts';
import { parseIdeaIssues } from './parse.ts';
import { commentEvents, parseComments, summarizeProject } from './project.ts';
import { parseWorkflowRuns } from './runs.ts';

export class NotFoundError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An Idea-form body ("### Problem\n\n…") as sections. A free-form body is one section; "_No response_" drops out. */
export function parseIdeaBody(body: unknown): IdeaSection[] {
  if (typeof body !== 'string' || !body.trim()) return [];
  const parts = body.split(/^###\s+(.+?)\s*$/m);
  const sections: IdeaSection[] = [];
  const lead = parts[0]?.trim();
  if (lead) sections.push({ heading: 'Idea', text: lead });
  for (let i = 1; i < parts.length; i += 2) {
    const text = (parts[i + 1] ?? '').trim();
    if (!text || text === '_No response_') continue;
    sections.push({ heading: parts[i] ?? '', text });
  }
  return sections;
}

export function parsePulls(json: unknown): ProductPull[] {
  if (!Array.isArray(json)) return [];
  const pulls: ProductPull[] = [];
  for (const item of json as unknown[]) {
    if (!isRecord(item)) continue;
    const { number, title, state, draft, html_url: url, updated_at: updatedAt } = item;
    if (typeof number !== 'number' || typeof title !== 'string' || typeof url !== 'string')
      continue;
    pulls.push({
      number,
      title,
      state: typeof item.merged_at === 'string' ? 'merged' : state === 'open' ? 'open' : 'closed',
      draft: draft === true,
      url,
      updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
    });
  }
  return pulls;
}

/**
 * One project in full: its issue, every comment (split into stage events), and the product repo's pull requests
 * and runs. The verdict and score come from the board's document, which already read the report and Critic runs.
 */
export async function buildProject(
  env: Pick<Env, 'SOURCE_REPO' | 'GITHUB_READ_TOKEN'>,
  number: number,
  status: StatusResponse | null,
  fetchImpl?: FetchLike,
): Promise<ProjectDetail> {
  const repo = resolveRepo(env);
  const api = `https://api.github.com/repos/${repo}`;
  const { getJson, attempt } = githubReader(env, fetchImpl);

  let issueJson: unknown;
  try {
    issueJson = await getJson(`${api}/issues/${number}`);
  } catch (error) {
    if (error instanceof Error && / answered 404$/.test(error.message)) throw new NotFoundError();
    throw error;
  }
  const [issue] = parseIdeaIssues([issueJson], repo);
  if (!issue) throw new NotFoundError();

  const comments = parseComments(await getJson(`${api}/issues/${number}/comments?per_page=100`));
  for (const c of comments) c.issue = number;
  const fromBoard: ProjectSummary | undefined = status?.projects.find((p) => p.number === number);
  const summary = summarizeProject(issue, comments, status?.runs ?? [], []);

  const productRepo = summary.productRepo;
  const [pullsJson, runsJson] = productRepo
    ? await Promise.all([
        attempt(() =>
          getJson(`https://api.github.com/repos/${productRepo}/pulls?state=all&per_page=10`),
        ),
        attempt(() =>
          getJson(`https://api.github.com/repos/${productRepo}/actions/runs?per_page=10`),
        ),
      ])
    : [null, null];

  return {
    ...summary,
    verdict: fromBoard?.verdict ?? null,
    reason: fromBoard?.reason ?? null,
    changes: fromBoard?.changes ?? [],
    body: parseIdeaBody(isRecord(issueJson) ? issueJson.body : null),
    events: comments.flatMap(commentEvents),
    pulls: parsePulls(pullsJson),
    productRuns: parseWorkflowRuns(runsJson).map(({ at, status: s, title, url, workflow }) => ({
      at,
      status: s,
      title: `${workflow.replace(/\.ya?ml$/, '')}: ${title}`,
      url,
    })),
    // A change's spec is changes/<issue>.md; its repo marker only appears once the Architect committed it.
    blueprintUrl: productRepo
      ? `https://github.com/${productRepo}/blob/main/${summary.kind === 'change' ? `changes/${number}.md` : 'blueprint.md'}`
      : null,
  };
}
