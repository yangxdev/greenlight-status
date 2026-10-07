// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { MeResponse } from '../../shared/api.ts';
import { SESSION_COOKIE, STATE_COOKIE, readSession, seal, unseal } from '../auth/session.ts';
import type { Env } from '../env.ts';
import type { RouteContext } from '../router.ts';
import { resetStatusCache } from '../status/cache.ts';
import { login, makeCallback, me } from './auth.ts';
import {
  changeBody,
  ideaBody,
  makeWriteRoutes,
  noteBody,
  validateChange,
  validateIdea,
  validateNote,
} from './write.ts';

const ORIGIN = 'https://greenlight-status.example.workers.dev';
const env = {
  SOURCE_REPO: 'yangxdev/greenlight',
  GITHUB_APP_CLIENT_ID: 'Iv1.client',
  GITHUB_APP_CLIENT_SECRET: 'shh',
  SESSION_SECRET: 'a-long-random-secret',
} as Env;

function ctx(
  path: string,
  init: RequestInit & { cookies?: string } = {},
  params: Record<string, string> = {},
  e: Env = env,
): RouteContext {
  const headers = new Headers(init.headers);
  if (init.cookies) headers.set('cookie', init.cookies);
  const request = new Request(`${ORIGIN}${path}`, { ...init, headers });
  return { request, env: e, ctx: {} as ExecutionContext, url: new URL(request.url), params };
}

async function sessionCookie(login: string, exp = Date.now() + 60_000) {
  return `${SESSION_COOKIE}=${await seal({ login, token: 'user-token', exp }, env.SESSION_SECRET as string)}`;
}

/** A fake api.github.com that records every call and answers from `answers` by "METHOD path". */
function fakeApi(answers: Record<string, Response> = {}) {
  const calls: { method: string; url: string; body: unknown; auth: string | null }[] = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      url: input,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      auth: new Headers(init?.headers).get('authorization'),
    });
    const path = input.replace('https://api.github.com', '');
    const hit = answers[`${method} ${path}`];
    if (hit) return hit.clone();
    if (method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({}, { status: 200 });
  };
  return { fetchImpl, calls };
}

const post = (
  body: unknown,
  cookies?: string,
  origin = ORIGIN,
): RequestInit & { cookies?: string } => ({
  method: 'POST',
  headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify(body),
  cookies,
});

const IDEA = {
  title: 'glossary-guard',
  problem: 'Translators mix up glossaries.',
  users: 'Freelance translators',
  mvp: '- Upload a glossary\n- Highlight terms',
  competition: '',
  signals: '',
  nongoals: '',
  approve: false,
};

beforeEach(() => resetStatusCache());

describe('session sealing', () => {
  it('round-trips, and rejects tampering or another secret', async () => {
    const sealed = await seal({ a: 1 }, 'one');
    expect(await unseal(sealed, 'one')).toEqual({ a: 1 });
    expect(await unseal(sealed, 'two')).toBeNull();
    expect(await unseal(`${sealed.slice(0, -2)}xx`, 'one')).toBeNull();
    expect(await unseal('not-base64!', 'one')).toBeNull();
  });

  it('expires with its token', async () => {
    const cookies = await sessionCookie('yangxdev', Date.now() - 1);
    const request = new Request(ORIGIN, { headers: { cookie: cookies } });
    expect(await readSession(request, env.SESSION_SECRET)).toBeNull();
  });
});

describe('GET /api/me', () => {
  it('says sign-in is unavailable when the App is not configured', async () => {
    const res = await me(ctx('/api/me', {}, {}, { SOURCE_REPO: 'yangxdev/greenlight' } as Env));
    expect((await res.json()) as MeResponse).toEqual({
      signInAvailable: false,
      login: null,
      owner: false,
    });
  });

  it('reports the owner when signed in', async () => {
    const res = await me(ctx('/api/me', { cookies: await sessionCookie('YangXDev') }));
    expect((await res.json()) as MeResponse).toEqual({
      signInAvailable: true,
      login: 'YangXDev',
      owner: true,
    });
  });
});

describe('sign-in flow', () => {
  it('sends the browser to GitHub with a sealed state, and keeps only same-site return paths', async () => {
    const res = await login(ctx('/api/auth/login?return=//evil.example'));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe('Iv1.client');
    expect(location.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`);
    const stateCookie = res.headers.get('set-cookie') ?? '';
    expect(stateCookie).toContain(`${STATE_COOKIE}=`);
    expect(stateCookie).toContain('HttpOnly');
    const sealed = /gls_oauth=([^;]+)/.exec(stateCookie)?.[1] ?? '';
    const stored = (await unseal(sealed, env.SESSION_SECRET as string)) as Record<string, unknown>;
    expect(stored.state).toBe(location.searchParams.get('state'));
    expect(stored.return).toBe('/');
  });

  async function callbackWith(login: string, state = 'abc', sent = 'abc') {
    const sealed = await seal({ state, return: '/p/5' }, env.SESSION_SECRET as string);
    const api = fakeApi({
      'POST https://github.com/login/oauth/access_token': Response.json({
        access_token: 'user-token',
        expires_in: 28800,
      }),
      'GET /user': Response.json({ login }),
    });
    const res = await makeCallback(api.fetchImpl)(
      ctx(`/api/auth/callback?code=c0de&state=${sent}`, { cookies: `${STATE_COOKIE}=${sealed}` }),
    );
    return { res, api };
  }

  it('signs the owner in and returns to where they were', async () => {
    const { res, api } = await callbackWith('yangxdev');
    expect(res.headers.get('location')).toBe('/p/5');
    expect(res.headers.get('set-cookie')).toContain(`${SESSION_COOKIE}=`);
    const exchange = api.calls[0];
    expect(exchange?.body).toMatchObject({
      client_id: 'Iv1.client',
      client_secret: 'shh',
      code: 'c0de',
    });
  });

  it('turns anyone else away without a session', async () => {
    const { res } = await callbackWith('someone-else');
    expect(res.headers.get('location')).toBe('/?signin=denied');
    expect(res.headers.get('set-cookie')).not.toContain(`${SESSION_COOKIE}=`);
  });

  it('refuses a state that does not match', async () => {
    const { res, api } = await callbackWith('yangxdev', 'abc', 'xyz');
    expect(res.headers.get('location')).toBe('/?signin=failed');
    expect(api.calls).toHaveLength(0);
  });
});

describe('writes', () => {
  it('refuse cross-site requests, missing sessions and non-owners', async () => {
    const { createIdea } = makeWriteRoutes(fakeApi().fetchImpl);
    const owner = await sessionCookie('yangxdev');
    expect(
      (await createIdea(ctx('/api/ideas', post(IDEA, owner, 'https://evil.example')))).status,
    ).toBe(403);
    expect((await createIdea(ctx('/api/ideas', post(IDEA)))).status).toBe(401);
    expect(
      (await createIdea(ctx('/api/ideas', post(IDEA, await sessionCookie('stranger'))))).status,
    ).toBe(403);
  });

  it('files an idea as the owner, in the Idea form format, and approves it when asked', async () => {
    const api = fakeApi({
      'POST /repos/yangxdev/greenlight/issues': Response.json(
        { number: 12, html_url: 'https://github.com/yangxdev/greenlight/issues/12' },
        { status: 201 },
      ),
    });
    const { createIdea } = makeWriteRoutes(api.fetchImpl);
    const res = await createIdea(
      ctx('/api/ideas', post({ ...IDEA, approve: true }, await sessionCookie('yangxdev'))),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      number: 12,
      url: 'https://github.com/yangxdev/greenlight/issues/12',
    });
    const [create, approve] = api.calls;
    expect(create?.auth).toBe('Bearer user-token');
    expect(create?.body).toMatchObject({ title: '[idea] glossary-guard', labels: ['idea'] });
    expect((create?.body as { body: string }).body).toContain(
      '### Problem\n\nTranslators mix up glossaries.',
    );
    expect((create?.body as { body: string }).body).toContain(
      '### Existing alternatives\n\n_No response_',
    );
    expect(approve).toMatchObject({
      method: 'POST',
      url: 'https://api.github.com/repos/yangxdev/greenlight/issues/12/labels',
      body: { labels: ['approved'] },
    });
  });

  it('validates the idea before calling GitHub', () => {
    expect(validateIdea({ ...IDEA, title: '' })).toEqual({ error: 'Give the idea a name.' });
    expect('error' in validateIdea({ ...IDEA, mvp: ' ' })).toBe(true);
    expect('error' in validateIdea({ ...IDEA, title: 'a\nb' })).toBe(true);
    expect(validateIdea({ ...IDEA, title: '[idea] x' })).toMatchObject({ idea: { title: 'x' } });
    expect(ideaBody({ ...IDEA, signals: 'https://news.ycombinator.com/item?id=1' })).toContain(
      '### Signals / sources\n\nhttps://news.ycombinator.com/item?id=1',
    );
  });

  const NOTES_ISSUE = 'POST /repos/yangxdev/greenlight/issues';
  const created = () =>
    Response.json(
      { number: 21, html_url: 'https://github.com/yangxdev/greenlight/issues/21' },
      { status: 201 },
    );

  it('CH1: files a note as the owner with the title, label and body the Scribe reads', async () => {
    const api = fakeApi({ [NOTES_ISSUE]: created() });
    const { createNote } = makeWriteRoutes(api.fetchImpl);
    const note = 'Bike shops keep paper cards\nso nobody knows…';
    const res = await createNote(
      ctx(
        '/api/notes',
        post(
          { kind: 'Idea', note, links: 'https://a.example\n\n  https://b.example ' },
          await sessionCookie('yangxdev'),
        ),
      ),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      number: 21,
      url: 'https://github.com/yangxdev/greenlight/issues/21',
    });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.github.com/repos/yangxdev/greenlight/issues',
      auth: 'Bearer user-token',
      body: {
        title: '[note] Bike shops keep paper cards',
        labels: ['note'],
        body: `### Kind\n\nIdea\n\n### Note\n\n${note}\n\n### Links\n\nhttps://a.example\nhttps://b.example`,
      },
    });
  });

  it('CH2: cuts the title to 60 characters, marks empty links and keeps the kind', async () => {
    const api = fakeApi({ [NOTES_ISSUE]: created() });
    const { createNote } = makeWriteRoutes(api.fetchImpl);
    const long = `${'a'.repeat(59)} ${'b'.repeat(40)}`;
    await createNote(
      ctx(
        '/api/notes',
        post({ kind: 'Evidence', note: `\n  ${long}`, links: '' }, await sessionCookie('yangxdev')),
      ),
    );
    const sent = api.calls[0]?.body as { title: string; body: string };
    expect(sent.title).toBe(`[note] ${'a'.repeat(59)}`);
    expect(sent.body).toContain('### Kind\n\nEvidence\n\n');
    expect(sent.body.endsWith('### Links\n\n_No response_')).toBe(true);
    expect(noteBody({ kind: 'Idea', note: ' x ', links: ' \n ' })).toContain('### Note\n\nx\n');
  });

  it('CH3: refuses cross-site requests, missing sessions, strangers and an unconfigured Worker', async () => {
    const api = fakeApi();
    const { createNote } = makeWriteRoutes(api.fetchImpl);
    const note = { kind: 'Idea', note: 'x', links: '' };
    const owner = await sessionCookie('yangxdev');
    const status = async (c: ReturnType<typeof ctx>) => (await createNote(c)).status;
    expect(await status(ctx('/api/notes', post(note, owner, 'https://evil.example')))).toBe(403);
    expect(await status(ctx('/api/notes', post(note)))).toBe(401);
    expect(await status(ctx('/api/notes', post(note, await sessionCookie('stranger'))))).toBe(403);
    expect(await status(ctx('/api/notes', post(note, owner), {}, {} as Env))).toBe(403);
    expect(api.calls).toHaveLength(0);
  });

  it('CH4: rejects a blank note, another kind and over-long fields without calling GitHub', async () => {
    const api = fakeApi();
    const { createNote } = makeWriteRoutes(api.fetchImpl);
    const owner = await sessionCookie('yangxdev');
    const send = (body: unknown) => createNote(ctx('/api/notes', post(body, owner)));
    expect((await send({ kind: 'Idea', note: '  \n ', links: '' })).status).toBe(400);
    expect((await send({ kind: 'Bug', note: 'x', links: '' })).status).toBe(400);
    expect((await send({ note: 'x' })).status).toBe(400);
    expect((await send({ kind: 'Idea', note: 'x'.repeat(5001), links: '' })).status).toBe(400);
    expect((await send({ kind: 'Idea', note: 'x', links: 'x'.repeat(5001) })).status).toBe(400);
    expect(validateNote({ kind: 'Bug', note: 'x' })).toEqual({ error: 'Pick Idea or Evidence.' });
    expect(validateNote({ kind: 'Idea', note: ' ' })).toEqual({ error: 'Write the note first.' });
    expect(api.calls).toHaveLength(0);
  });

  it('CH5: answers GitHub failures as createIdea does', async () => {
    const owner = await sessionCookie('yangxdev');
    const note = { kind: 'Idea', note: 'x', links: '' };
    const expired = makeWriteRoutes(
      fakeApi({
        [NOTES_ISSUE]: Response.json({ message: 'Bad credentials' }, { status: 401 }),
      }).fetchImpl,
    );
    const res401 = await expired.createNote(ctx('/api/notes', post(note, owner)));
    expect(res401.status).toBe(401);
    expect(res401.headers.get('set-cookie')).toContain(`${SESSION_COOKIE}=;`);
    const refused = makeWriteRoutes(
      fakeApi({
        [NOTES_ISSUE]: Response.json({ message: 'Validation Failed' }, { status: 422 }),
      }).fetchImpl,
    );
    const res422 = await refused.createNote(ctx('/api/notes', post(note, owner)));
    expect(res422.status).toBe(502);
    expect(await res422.json()).toEqual({ error: 'GitHub refused: Validation Failed' });
  });

  const issue = (labels: string[], state = 'open') =>
    Response.json({
      number: 5,
      title: '[idea] x',
      state,
      labels: labels.map((name) => ({ name })),
    });

  it('starts the build only from a reviewed blueprint', async () => {
    const owner = await sessionCookie('yangxdev');
    const early = makeWriteRoutes(
      fakeApi({ 'GET /repos/yangxdev/greenlight/issues/5': issue(['idea']) }).fetchImpl,
    );
    const refused = await early.projectAction(
      ctx('/api/projects/5/actions', post({ action: 'blueprint-ok' }, owner), { number: '5' }),
    );
    expect(refused.status).toBe(409);

    const api = fakeApi({ 'GET /repos/yangxdev/greenlight/issues/5': issue(['blueprint-ready']) });
    const ready = makeWriteRoutes(api.fetchImpl);
    const res = await ready.projectAction(
      ctx('/api/projects/5/actions', post({ action: 'blueprint-ok' }, owner), { number: '5' }),
    );
    expect(res.status).toBe(200);
    expect(api.calls.at(-1)).toMatchObject({ method: 'POST', body: { labels: ['blueprint-ok'] } });
  });

  it('retries a project stuck in the build from its blueprint, removing the gate label first', async () => {
    const api = fakeApi({
      'GET /repos/yangxdev/greenlight/issues/5': issue(['stuck', 'blueprint-ok']),
      'GET /repos/yangxdev/greenlight/issues/5/comments?per_page=100': Response.json([
        {
          body: '**Inspector:** failed 3 fix rounds and needs a human.',
          created_at: '2026-10-01T00:00:00Z',
          user: { login: 'yangxdev' },
          author_association: 'OWNER',
        },
      ]),
    });
    const { projectAction } = makeWriteRoutes(api.fetchImpl);
    const res = await projectAction(
      ctx('/api/projects/5/actions', post({ action: 'retry' }, await sessionCookie('yangxdev')), {
        number: '5',
      }),
    );
    expect(res.status).toBe(200);
    expect(api.calls.slice(-2).map((c) => `${c.method} ${c.url.split('/issues/5')[1]}`)).toEqual([
      'DELETE /labels/blueprint-ok',
      'POST /labels',
    ]);
  });

  it('archives by swapping the state label and closing the issue', async () => {
    const api = fakeApi({ 'GET /repos/yangxdev/greenlight/issues/5': issue(['live']) });
    const { projectAction } = makeWriteRoutes(api.fetchImpl);
    await projectAction(
      ctx('/api/projects/5/actions', post({ action: 'archive' }, await sessionCookie('yangxdev')), {
        number: '5',
      }),
    );
    expect(api.calls.slice(1).map((c) => c.method)).toEqual(['DELETE', 'POST', 'PATCH']);
    expect(api.calls.at(-1)?.body).toEqual({ state: 'closed', state_reason: 'not_planned' });
  });

  it('clears the session when GitHub says the token expired', async () => {
    const api = fakeApi({
      'POST /repos/yangxdev/greenlight/issues/5/comments': Response.json(
        { message: 'Bad credentials' },
        { status: 401 },
      ),
    });
    const { addComment } = makeWriteRoutes(api.fetchImpl);
    const res = await addComment(
      ctx(
        '/api/projects/5/comments',
        post({ body: 'Make it smaller.' }, await sessionCookie('yangxdev')),
        {
          number: '5',
        },
      ),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toContain(`${SESSION_COOKIE}=;`);
  });
});

describe('requesting a change', () => {
  const CHANGE = {
    title: 'Move to the app layout',
    change: 'The board first.',
    why: '',
    keep: 'All data.',
    approve: true,
  };
  const product = (labels: string[]) =>
    Response.json({
      number: 5,
      title: '[idea] x',
      state: 'open',
      labels: labels.map((name) => ({ name })),
    });

  it('files a change sub-issue under a live product, approved when asked', async () => {
    const api = fakeApi({
      'GET /repos/yangxdev/greenlight/issues/5': product(['live']),
      'POST /repos/yangxdev/greenlight/issues': Response.json(
        { id: 999, number: 12, html_url: 'https://github.com/yangxdev/greenlight/issues/12' },
        { status: 201 },
      ),
    });
    const { createChange } = makeWriteRoutes(api.fetchImpl);
    const res = await createChange(
      ctx('/api/projects/5/changes', post(CHANGE, await sessionCookie('yangxdev')), {
        number: '5',
      }),
    );
    expect(res.status).toBe(201);
    const [, create, link, approve] = api.calls;
    expect(create?.body).toMatchObject({
      title: '[change] Move to the app layout',
      labels: ['change'],
    });
    const body = (create?.body as { body: string }).body;
    expect(body).toContain('### Product issue\n\n#5');
    expect(body).toContain('### Why\n\n_No response_');
    expect(body).toContain('<!-- greenlight:parent=5 -->');
    expect(link).toMatchObject({
      url: 'https://api.github.com/repos/yangxdev/greenlight/issues/5/sub_issues',
      body: { sub_issue_id: 999 },
    });
    expect(approve).toMatchObject({
      url: 'https://api.github.com/repos/yangxdev/greenlight/issues/12/labels',
      body: { labels: ['approved'] },
    });
  });

  it('refuses a product that is not live, and a change without content', async () => {
    const owner = await sessionCookie('yangxdev');
    const early = makeWriteRoutes(
      fakeApi({ 'GET /repos/yangxdev/greenlight/issues/5': product(['building']) }).fetchImpl,
    );
    expect(
      (
        await early.createChange(
          ctx('/api/projects/5/changes', post(CHANGE, owner), { number: '5' }),
        )
      ).status,
    ).toBe(409);
    expect(validateChange({ ...CHANGE, change: '' })).toEqual({ error: 'Say what should change.' });
    expect(changeBody(5, { ...CHANGE, keep: '' })).toContain(
      '### Must not change\n\n_No response_',
    );
  });
});
