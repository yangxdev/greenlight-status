/** Test helper: a fake GitHub, keyed by URL. Anything not listed answers 404. */
export type Responder = Response | (() => Response);

export function fakeGithub(routes: Record<string, Responder>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url: input, headers: { ...(init?.headers as Record<string, string>) } });
    const hit = routes[input];
    if (hit === undefined) return new Response('not found', { status: 404 });
    return typeof hit === 'function' ? hit() : hit.clone();
  };
  return { fetchImpl, calls };
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });

export const TABLE =
  '| Name | Pain | Competition | MVP | Reach | Total | Verdict |\n|---|---|---|---|---|---|---|\n| Alpha | 4 | 4 | 4 | 3 | 15/20 | file |\n| Beta | 3 | 3 | 3 | 3 | 12/20 | skip |\n';

export const API = 'https://api.github.com/repos/yangxdev/greenlight';
export const RAW = 'https://raw.githubusercontent.com/yangxdev/greenlight/main';

export function baseRoutes(): Record<string, Responder> {
  return {
    [`${API}/issues?state=all&per_page=100`]: json([
      {
        number: 7,
        title: '[idea] Alpha',
        state: 'open',
        labels: [{ name: 'idea' }],
        html_url: 'https://github.com/yangxdev/greenlight/issues/7',
      },
    ]),
    [`${API}/contents/analysis`]: json([{ name: '2026-10-02-critic.md' }]),
    [`${API}/contents/reports`]: json([]),
    [`${RAW}/analysis/2026-10-02-critic.md`]: new Response(TABLE),
  };
}
