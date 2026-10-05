/**
 * Bindings and secrets available to the Worker.
 * Add a field here whenever wrangler.jsonc gains a binding or a secret is set with `wrangler secret put`.
 */
export interface Env {
  /** The built SPA (wrangler.jsonc "assets.binding"). */
  ASSETS: Fetcher;
  /** R2 bucket, binding "BUCKET" in wrangler.jsonc (optional until the blueprint needs it). */
  BUCKET?: R2Bucket;
  /** MongoDB Atlas connection string, set with `npx wrangler secret put MONGODB_URI`. */
  MONGODB_URI?: string;
  MONGODB_DB?: string;
  /** Public GitHub repo to read (plain var in wrangler.jsonc). Falls back to yangxdev/greenlight when invalid. */
  SOURCE_REPO?: string;
  /** Optional read-only GitHub token, set with `npx wrangler secret put GITHUB_READ_TOKEN`. */
  GITHUB_READ_TOKEN?: string;
  /**
   * Sign-in for the owner (all three, or the dashboard stays read-only). A GitHub App's client ID (plain var), its
   * client secret and a random SESSION_SECRET that seals the session cookie (both `wrangler secret put`).
   */
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
}
