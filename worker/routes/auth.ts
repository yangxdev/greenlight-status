import type { MeResponse } from '../../shared/api.ts';
import {
  MAX_SESSION_MS,
  SESSION_COOKIE,
  STATE_COOKIE,
  cookie,
  readCookie,
  readSession,
  seal,
  unseal,
} from '../auth/session.ts';
import type { Env } from '../env.ts';
import { errorResponse, type Handler } from '../router.ts';
import { resolveRepo } from '../status/github.ts';

const STATE_MAX_AGE = 10 * 60;

export function signInConfigured(env: Env): env is Env & {
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_CLIENT_SECRET: string;
  SESSION_SECRET: string;
} {
  return Boolean(env.GITHUB_APP_CLIENT_ID && env.GITHUB_APP_CLIENT_SECRET && env.SESSION_SECRET);
}

/** The pipeline repo's owner: the one login whose gate labels start the Architect and the Factory. */
export function ownerOf(env: Env): string {
  return resolveRepo(env).split('/')[0] ?? '';
}

export const isOwner = (env: Env, login: string) =>
  login.toLowerCase() === ownerOf(env).toLowerCase();

/** Only same-site paths: "/p/5" yes, "//evil.example" and "https://…" no. */
function safeReturn(path: string | null): string {
  return path && /^\/(?![/\\])/.test(path) ? path : '/';
}

const redirect = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
};

/** GET /api/me: who is signed in, and whether they can write. */
export const me: Handler = async ({ env, request }) => {
  const session = await readSession(request, env.SESSION_SECRET);
  const body: MeResponse = {
    signInAvailable: signInConfigured(env),
    login: session?.login ?? null,
    owner: session ? isOwner(env, session.login) : false,
  };
  return Response.json(body, { headers: { 'cache-control': 'no-store' } });
};

/** GET /api/auth/login?return=/p/5: off to GitHub, with a sealed one-time state that the callback checks. */
export const login: Handler = async ({ env, url }) => {
  if (!signInConfigured(env)) return errorResponse(404, 'Sign-in is not set up on this dashboard.');
  const state = crypto.randomUUID();
  const sealed = await seal(
    { state, return: safeReturn(url.searchParams.get('return')) },
    env.SESSION_SECRET,
  );
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_APP_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${url.origin}/api/auth/callback`);
  authorize.searchParams.set('state', state);
  return redirect(authorize.toString(), [cookie(STATE_COOKIE, sealed, STATE_MAX_AGE, '/api/auth')]);
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * GET /api/auth/callback: trade the code for a user token, and keep it only if it belongs to the owner. Anyone else
 * is sent back read-only, and their token is dropped on the spot.
 */
export function makeCallback(fetchImpl: FetchLike = (i, init) => fetch(i, init)): Handler {
  return async ({ env, request, url }) => {
    if (!signInConfigured(env))
      return errorResponse(404, 'Sign-in is not set up on this dashboard.');
    const clearState = cookie(STATE_COOKIE, '', 0, '/api/auth');
    const stored = readCookie(request, STATE_COOKIE);
    const value = stored ? await unseal(stored, env.SESSION_SECRET) : null;
    const expected =
      typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
    const code = url.searchParams.get('code');
    if (!expected || !code || expected.state !== url.searchParams.get('state')) {
      return redirect('/?signin=failed', [clearState]);
    }
    const back = safeReturn(typeof expected.return === 'string' ? expected.return : null);

    const tokenRes = await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_APP_CLIENT_ID,
        client_secret: env.GITHUB_APP_CLIENT_SECRET,
        code,
        redirect_uri: `${url.origin}/api/auth/callback`,
      }),
    });
    const tokenBody = tokenRes.ok ? ((await tokenRes.json()) as Record<string, unknown>) : {};
    const token = tokenBody.access_token;
    if (typeof token !== 'string') return redirect('/?signin=failed', [clearState]);

    const userRes = await fetchImpl('https://api.github.com/user', {
      headers: { authorization: `Bearer ${token}`, 'user-agent': 'greenlight-status' },
    });
    const user = userRes.ok ? ((await userRes.json()) as Record<string, unknown>) : {};
    if (typeof user.login !== 'string') return redirect('/?signin=failed', [clearState]);
    if (!isOwner(env, user.login)) return redirect('/?signin=denied', [clearState]);

    const lifetime =
      typeof tokenBody.expires_in === 'number'
        ? Math.min(tokenBody.expires_in * 1000, MAX_SESSION_MS)
        : MAX_SESSION_MS;
    const session = await seal(
      { login: user.login, token, exp: Date.now() + lifetime },
      env.SESSION_SECRET,
    );
    return redirect(back, [clearState, cookie(SESSION_COOKIE, session, lifetime / 1000)]);
  };
}

export const callback = makeCallback();

/** POST /api/auth/logout */
export const logout: Handler = () =>
  new Response(null, {
    status: 204,
    headers: { 'set-cookie': cookie(SESSION_COOKIE, '', 0), 'cache-control': 'no-store' },
  });
