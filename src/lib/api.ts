/** Thin fetch wrapper for the same-origin Worker API under /api. Errors carry the server's `{ error }` message. */
export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    let message = `GET /api${path} failed: ${res.status}`;
    try {
      const body: unknown = await res.json();
      if (typeof body === 'object' && body !== null && 'error' in body) {
        const { error } = body as { error: unknown };
        if (typeof error === 'string' && error) message = error;
      }
    } catch {
      // not JSON: keep the generic message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}
