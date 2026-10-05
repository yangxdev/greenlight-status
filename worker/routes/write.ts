import type {
  CommentRequest,
  IdeaState,
  NewChange,
  NewIdea,
  NewIdeaResponse,
  ProjectAction,
} from '../../shared/api.ts';
import { SESSION_COOKIE, cookie, readSession, type Session } from '../auth/session.ts';
import { errorResponse, type Handler, type RouteContext } from '../router.ts';
import { invalidate } from '../status/cache.ts';
import { resolveRepo } from '../status/github.ts';
import { parseIdeaIssues } from '../status/parse.ts';
import { commentEvents, deriveSteps, parseComments } from '../status/project.ts';
import { isOwner, signInConfigured } from './auth.ts';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const MAX_FIELD = 5000;
const MAX_TITLE = 60;

class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Calls api.github.com as the signed-in owner, with their user token. */
function asOwner(session: Session, fetchImpl: FetchLike) {
  return async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const res = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers: {
        authorization: `Bearer ${session.token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'greenlight-status',
        ...(body === undefined ? null : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return null;
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        typeof json === 'object' && json !== null && 'message' in json
          ? String((json as { message: unknown }).message)
          : `GitHub answered ${res.status}`;
      throw new GitHubError(res.status, message);
    }
    return json;
  };
}

type Call = ReturnType<typeof asOwner>;

/**
 * Every write needs the owner's session and a same-origin request. The cookie is SameSite=Lax, so a cross-site
 * POST arrives without it anyway; the Origin check is the second lock.
 */
async function requireOwner(ctx: RouteContext): Promise<Session | Response> {
  const { env, request, url } = ctx;
  if (!signInConfigured(env)) return errorResponse(403, 'Sign-in is not set up on this dashboard.');
  if (request.headers.get('origin') !== url.origin) {
    return errorResponse(403, 'Cross-site request refused.');
  }
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return errorResponse(401, 'Sign in with GitHub to do this.');
  if (!isOwner(env, session.login))
    return errorResponse(403, 'Only the pipeline owner can do this.');
  return session;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function failed(error: unknown): Response {
  if (error instanceof GitHubError) {
    if (error.status === 401) {
      return errorResponse(401, 'Your GitHub sign-in expired. Sign in again.', {
        'set-cookie': cookie(SESSION_COOKIE, '', 0),
      });
    }
    return errorResponse(502, `GitHub refused: ${error.message}`);
  }
  throw error;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function validateIdea(body: Record<string, unknown>): { idea: NewIdea } | { error: string } {
  const idea: NewIdea = {
    title: text(body.title).replace(/^\[idea\]\s*/i, ''),
    problem: text(body.problem),
    users: text(body.users),
    mvp: text(body.mvp),
    competition: text(body.competition),
    signals: text(body.signals),
    nongoals: text(body.nongoals),
    approve: body.approve === true,
  };
  if (!idea.title) return { error: 'Give the idea a name.' };
  if (idea.title.length > MAX_TITLE || /[\r\n]/.test(idea.title)) {
    return { error: `Keep the name to one line of at most ${MAX_TITLE} characters.` };
  }
  if (!idea.problem || !idea.users || !idea.mvp) {
    return { error: 'Problem, target users and the one-day MVP are required.' };
  }
  const long = (['problem', 'users', 'mvp', 'competition', 'signals', 'nongoals'] as const).find(
    (k) => idea[k].length > MAX_FIELD,
  );
  if (long) return { error: `Keep each field under ${MAX_FIELD} characters.` };
  return { idea };
}

/** The same markdown GitHub's Idea form produces, so the Architect reads both alike. */
export function ideaBody(idea: NewIdea): string {
  const section = (heading: string, value: string) =>
    `### ${heading}\n\n${value || '_No response_'}`;
  return [
    section('Problem', idea.problem),
    section('Target users', idea.users),
    section('MVP in one day', idea.mvp),
    section('Existing alternatives', idea.competition),
    section('Signals / sources', idea.signals),
    section('Explicit non-goals', idea.nongoals),
  ].join('\n\n');
}

export function validateChange(
  body: Record<string, unknown>,
): { change: NewChange } | { error: string } {
  const change: NewChange = {
    title: text(body.title).replace(/^\[change\]\s*/i, ''),
    change: text(body.change),
    why: text(body.why),
    keep: text(body.keep),
    approve: body.approve === true,
  };
  if (!change.title) return { error: 'Give the change a short title.' };
  if (change.title.length > 80 || /[\r\n]/.test(change.title)) {
    return { error: 'Keep the title to one line of at most 80 characters.' };
  }
  if (!change.change) return { error: 'Say what should change.' };
  if ([change.change, change.why, change.keep].some((v) => v.length > MAX_FIELD)) {
    return { error: `Keep each field under ${MAX_FIELD} characters.` };
  }
  return { change };
}

/** The Change form's markdown, plus the parent marker the Architect and the board read. */
export function changeBody(parent: number, change: NewChange): string {
  const section = (heading: string, value: string) =>
    `### ${heading}\n\n${value || '_No response_'}`;
  return [
    section('Product issue', `#${parent}`),
    section('What should change', change.change),
    section('Why', change.why),
    section('Must not change', change.keep),
    `<!-- greenlight:parent=${parent} -->`,
  ].join('\n\n');
}

/** Removing and re-adding a gate label is how a gate is re-run; the workflows only listen for "labeled". */
async function applyGate(call: Call, repo: string, number: number, label: string, has: boolean) {
  if (has) await call('DELETE', `/repos/${repo}/issues/${number}/labels/${label}`);
  await call('POST', `/repos/${repo}/issues/${number}/labels`, { labels: [label] });
}

const ACTIONS: readonly ProjectAction[] = ['approve', 'blueprint-ok', 'retry', 'archive'];

export function makeWriteRoutes(fetchImpl: FetchLike = (i, init) => fetch(i, init)) {
  /** POST /api/ideas: file an idea issue as the owner, optionally approved right away. */
  const createIdea: Handler = async (ctx) => {
    const session = await requireOwner(ctx);
    if (session instanceof Response) return session;
    const body = await readBody(ctx.request);
    if (!body) return errorResponse(400, 'Send the idea as JSON.');
    const checked = validateIdea(body);
    if ('error' in checked) return errorResponse(400, checked.error);
    const { idea } = checked;
    const repo = resolveRepo(ctx.env);
    const call = asOwner(session, fetchImpl);
    try {
      const created = (await call('POST', `/repos/${repo}/issues`, {
        title: `[idea] ${idea.title}`,
        body: ideaBody(idea),
        labels: ['idea'],
      })) as { number?: unknown; html_url?: unknown };
      if (typeof created.number !== 'number') return errorResponse(502, 'GitHub sent no issue.');
      if (idea.approve) await applyGate(call, repo, created.number, 'approved', false);
      invalidate();
      const res: NewIdeaResponse = {
        number: created.number,
        url: typeof created.html_url === 'string' ? created.html_url : '',
      };
      return Response.json(res, { status: 201 });
    } catch (error) {
      return failed(error);
    }
  };

  /** POST /api/projects/:number/actions: the gates, a retry of a stuck project, or archive. */
  const projectAction: Handler = async (ctx) => {
    const session = await requireOwner(ctx);
    if (session instanceof Response) return session;
    const number = Number(ctx.params.number);
    if (!Number.isInteger(number) || number < 1) return errorResponse(404, 'Unknown project.');
    const body = await readBody(ctx.request);
    const action = body?.action;
    if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
      return errorResponse(400, `action must be one of ${ACTIONS.join(', ')}.`);
    }
    const repo = resolveRepo(ctx.env);
    const call = asOwner(session, fetchImpl);
    try {
      const [issue] = parseIdeaIssues([await call('GET', `/repos/${repo}/issues/${number}`)], repo);
      if (!issue) return errorResponse(404, 'No idea issue with that number.');
      const has = (s: IdeaState) => issue.states.includes(s);

      if (action === 'approve') {
        if (!has('idea') && !has('blueprint-ready') && !has('stuck')) {
          return errorResponse(
            409,
            'Only a new idea, a blueprint to redo or a stuck project can be approved.',
          );
        }
        await applyGate(call, repo, number, 'approved', has('approved'));
      } else if (action === 'blueprint-ok') {
        if (!has('blueprint-ready'))
          return errorResponse(409, 'There is no reviewed blueprint to start.');
        await applyGate(call, repo, number, 'blueprint-ok', has('blueprint-ok'));
      } else if (action === 'retry') {
        if (!has('stuck')) return errorResponse(409, 'Only a stuck project can be retried.');
        // Stuck before the build: redo the blueprint. Stuck at or after the Factory: rebuild from the blueprint.
        const comments = parseComments(
          await call('GET', `/repos/${repo}/issues/${number}/comments?per_page=100`),
        );
        const { current } = deriveSteps(issue, comments.flatMap(commentEvents));
        const gate = ['board', 'architect', 'reviewer'].includes(current)
          ? 'approved'
          : 'blueprint-ok';
        await applyGate(call, repo, number, gate, has(gate));
      } else {
        if (has('archived') && issue.closed) return errorResponse(409, 'Already archived.');
        for (const state of issue.states) {
          if (state !== 'archived') {
            await call('DELETE', `/repos/${repo}/issues/${number}/labels/${state}`);
          }
        }
        await call('POST', `/repos/${repo}/issues/${number}/labels`, { labels: ['archived'] });
        await call('PATCH', `/repos/${repo}/issues/${number}`, {
          state: 'closed',
          state_reason: 'not_planned',
        });
      }
      invalidate(number);
      return Response.json({ ok: true });
    } catch (error) {
      return failed(error);
    }
  };

  /** POST /api/projects/:number/comments: feedback the Architect reads on its next run. */
  const addComment: Handler = async (ctx) => {
    const session = await requireOwner(ctx);
    if (session instanceof Response) return session;
    const number = Number(ctx.params.number);
    if (!Number.isInteger(number) || number < 1) return errorResponse(404, 'Unknown project.');
    const body = await readBody(ctx.request);
    const comment = text((body as Partial<CommentRequest> | null)?.body);
    if (!comment) return errorResponse(400, 'Write something first.');
    if (comment.length > MAX_FIELD) {
      return errorResponse(400, `Keep a comment under ${MAX_FIELD} characters.`);
    }
    const repo = resolveRepo(ctx.env);
    try {
      await asOwner(session, fetchImpl)('POST', `/repos/${repo}/issues/${number}/comments`, {
        body: comment,
      });
      invalidate(number);
      return Response.json({ ok: true }, { status: 201 });
    } catch (error) {
      return failed(error);
    }
  };

  /**
   * POST /api/projects/:number/changes: a change to that live product, filed as a [change] sub-issue of its idea
   * issue, optionally approved right away.
   */
  const createChange: Handler = async (ctx) => {
    const session = await requireOwner(ctx);
    if (session instanceof Response) return session;
    const parent = Number(ctx.params.number);
    if (!Number.isInteger(parent) || parent < 1) return errorResponse(404, 'Unknown project.');
    const body = await readBody(ctx.request);
    if (!body) return errorResponse(400, 'Send the change as JSON.');
    const checked = validateChange(body);
    if ('error' in checked) return errorResponse(400, checked.error);
    const { change } = checked;
    const repo = resolveRepo(ctx.env);
    const call = asOwner(session, fetchImpl);
    try {
      const [product] = parseIdeaIssues(
        [await call('GET', `/repos/${repo}/issues/${parent}`)],
        repo,
      );
      if (!product || product.kind !== 'idea') {
        return errorResponse(404, 'No idea issue with that number.');
      }
      if (!product.states.includes('live')) {
        return errorResponse(409, 'Changes are for live products; this one is not live.');
      }
      const created = (await call('POST', `/repos/${repo}/issues`, {
        title: `[change] ${change.title}`,
        body: changeBody(parent, change),
        labels: ['change'],
      })) as { id?: unknown; number?: unknown; html_url?: unknown };
      if (typeof created.number !== 'number') return errorResponse(502, 'GitHub sent no issue.');
      // The sub-issue link is what GitHub shows; the body's marker already ties it to the product if this fails.
      if (typeof created.id === 'number') {
        await call('POST', `/repos/${repo}/issues/${parent}/sub_issues`, {
          sub_issue_id: created.id,
        }).catch(() => undefined);
      }
      if (change.approve) await applyGate(call, repo, created.number, 'approved', false);
      invalidate(parent);
      const res: NewIdeaResponse = {
        number: created.number,
        url: typeof created.html_url === 'string' ? created.html_url : '',
      };
      return Response.json(res, { status: 201 });
    } catch (error) {
      return failed(error);
    }
  };

  return { createIdea, createChange, projectAction, addComment };
}

export const { createIdea, createChange, projectAction, addComment } = makeWriteRoutes();
