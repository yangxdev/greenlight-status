import type { Env } from './env.ts';
import { createRouter, type Route } from './router.ts';
import { health } from './routes/health.ts';
import { callback, login, logout, me } from './routes/auth.ts';
import { project, status } from './routes/status.ts';
import { addComment, createChange, createIdea, projectAction } from './routes/write.ts';

/** Every API route. Add new ones here; handlers live in worker/routes/. */
export const routes: Route[] = [
  { method: 'GET', pattern: '/api/health', handler: health },
  { method: 'GET', pattern: '/api/status', handler: status },
  { method: 'GET', pattern: '/api/projects/:number', handler: project },
  { method: 'GET', pattern: '/api/me', handler: me },
  { method: 'GET', pattern: '/api/auth/login', handler: login },
  { method: 'GET', pattern: '/api/auth/callback', handler: callback },
  { method: 'POST', pattern: '/api/auth/logout', handler: logout },
  { method: 'POST', pattern: '/api/ideas', handler: createIdea },
  { method: 'POST', pattern: '/api/projects/:number/actions', handler: projectAction },
  { method: 'POST', pattern: '/api/projects/:number/comments', handler: addComment },
  { method: 'POST', pattern: '/api/projects/:number/changes', handler: createChange },
];

const api = createRouter(routes);

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    // wrangler.jsonc only sends /api/* here first; anything else reaching the Worker is served from the assets.
    if (pathname === '/api' || pathname.startsWith('/api/')) return api(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
