import type { Handler } from '../router.ts';
import { getStatus } from '../status/cache.ts';

/** GET /api/status: the assembled pipeline document, cached in memory for ten minutes. */
export const status: Handler = ({ env }) => getStatus(env);
