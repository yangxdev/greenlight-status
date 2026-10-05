/**
 * The product's identity, from the blueprint's "Identity" section: the lowercase name is the wordmark, the tag
 * sits next to it in mono, and the description is the page's description and link-preview text.
 */
export const SITE_NAME = 'greenlight-status';

export const SITE_TAG = 'greenlight pipeline';

export const SITE_DESCRIPTION =
  'A dashboard of the Greenlight pipeline: every project and the stage it is at, what each step did, and the ideas the Critic scored.';

/** The repo this product's source lives in. */
export const SITE_REPO = 'yangxdev/greenlight-status';

/** The pipeline repo shown when the status document has not loaded yet (the Worker's default SOURCE_REPO). */
export const DEFAULT_SOURCE_REPO = 'yangxdev/greenlight';
