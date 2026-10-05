import { errorResponse, type Handler } from '../router.ts';
import { getProject, getStatus } from '../status/cache.ts';

/** GET /api/status: the board document, cached in memory for five minutes. */
export const status: Handler = ({ env }) => getStatus(env);

/** GET /api/projects/:number: one project in full, cached for a minute. */
export const project: Handler = ({ env, params }) => {
  const number = Number(params.number);
  if (!Number.isInteger(number) || number < 1) return errorResponse(404, 'Unknown project.');
  return getProject(env, number);
};
