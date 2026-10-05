/**
 * The sign-in session lives in the browser, sealed: an AES-GCM-encrypted, HttpOnly cookie holding the GitHub login
 * and its user token. The Worker stores nothing, and the cookie is useless without SESSION_SECRET.
 */

export interface Session {
  login: string;
  /** The GitHub App's user access token: acts as this person, limited to the App's permissions and repos. */
  token: string;
  /** Epoch ms. */
  exp: number;
}

export const SESSION_COOKIE = 'gls_session';
export const STATE_COOKIE = 'gls_oauth';
/** GitHub App user tokens last eight hours; a session never outlives its token. */
export const MAX_SESSION_MS = 8 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function key(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(value: unknown, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify(value));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), data),
  );
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return toBase64Url(out);
}

/** The sealed value, or null if it was tampered with, sealed with another secret, or isn't ours at all. */
export async function unseal(text: string, secret: string): Promise<unknown> {
  const bytes = fromBase64Url(text);
  if (!bytes || bytes.length < 13) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      await key(secret),
      bytes.slice(12),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as unknown;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export function cookie(name: string, value: string, maxAgeSeconds: number, path = '/'): string {
  return `${name}=${value}; Path=${path}; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; HttpOnly; Secure; SameSite=Lax`;
}

export async function readSession(
  request: Request,
  secret: string | undefined,
  now: number = Date.now(),
): Promise<Session | null> {
  if (!secret) return null;
  const raw = readCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  const value = await unseal(raw, secret);
  if (typeof value !== 'object' || value === null) return null;
  const { login, token, exp } = value as Record<string, unknown>;
  if (typeof login !== 'string' || typeof token !== 'string' || typeof exp !== 'number')
    return null;
  return exp > now ? { login, token, exp } : null;
}
