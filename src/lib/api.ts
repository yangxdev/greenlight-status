/** Thin fetch wrapper for the same-origin Worker API under /api. Errors carry the server's `{ error }` message. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? null : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `${method} /api${path} failed: ${res.status}`;
    try {
      const data: unknown = await res.json();
      if (typeof data === 'object' && data !== null && 'error' in data) {
        const { error } = data as { error: unknown };
        if (typeof error === 'string' && error) message = error;
      }
    } catch {
      // not JSON: keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiGet = <T>(path: string) => send<T>('GET', path);
export const apiPost = <T>(path: string, body?: unknown) => send<T>('POST', path, body);

/** The message from a thrown Error or from a thunk's `unwrap()` rejection, which is a plain `{ message }` object. */
export function messageOf(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}
