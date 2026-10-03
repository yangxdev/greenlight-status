# Build report

- **Blueprint:** blueprint.md @ 8fa348b
- **Greenlight issue:** yangxdev/greenlight#5
- **Run:** https://github.com/yangxdev/greenlight-status/actions/runs/37131071625
- **Result:** ✅ complete

## Tasks

| # | Task | Status | Commit | Notes |
|---|------|--------|--------|-------|
| 1 | Shared types and the markdown/issue parsers | done | 75772a2 | |
| 2 | GitHub reader and assembler | done | 8653fa6 | `worker/status/fixtures.ts` is a test helper (fake GitHub) shared by two test files |
| 3 | `/api/status` route and cache | done | 3dd8ee8 | |
| 4 | Client state for the status document | done | d4b654d | `apiGet` now surfaces the server's `{ error }` message |
| 5 | Identity, routing and Overview | done | e5156de | `SiteHeader` uses router links and shows its nav on phones too |
| 6 | Ideas screen | done | d392c4e | |
| 7 | README and polish | done | 4e1afd6 | `src/App.test.tsx` (AC28) was written with tasks 5 and 6; README committed as `docs: readme` |

## Acceptance criteria

| Criterion | Covered by test | Status |
|-----------|-----------------|--------|
| AC1–AC3 | `worker/status/parse.test.ts` › `parseCriticTable` | pass |
| AC4 | `worker/status/parse.test.ts` › `parseIdeaIssues` | pass |
| AC5 | `worker/status/parse.test.ts` › `parseWatchlist` | pass |
| AC6 | `worker/status/parse.test.ts` › `findRepoMarker and parseReport` | pass |
| AC7–AC11 | `worker/status/github.test.ts` | pass |
| AC12–AC15 | `worker/status/cache.test.ts`; 503 route check in `worker/worker.test.ts` (health still covered there) | pass |
| AC16–AC18 | `src/features/status/statusSlice.test.ts` | pass |
| AC19–AC23 | `src/features/status/Overview.test.tsx` | pass |
| AC24–AC27 | `src/features/status/Ideas.test.tsx` | pass |
| AC28 | `src/App.test.tsx` | pass |

## Checks (last run of `npm run check`)

- lint: pass (ESLint, Prettier, style guard)
- test: pass (57 tests)
- build: pass (bundle size: 98.46 kB gzip JS)

## Deviations from the blueprint

- The report JSON shape is not specified. `parseReport` assumes `{ week, summary, products: [{ issue, verdict, reason }] }`; entries without a numeric `issue` or a valid `verdict` are dropped.
- The watchlist bullet labels are matched loosely (a label containing "best", "evidence", "problem" or "need"), since the exact labels are unverified.
- `/api/status` sends `cache-control: no-store` on the 503 as well as on success.
- The old `HealthBadge` is no longer shown on the page (it is not in the blueprint); the component and `/api/health` remain.

## New dependencies

- `react-router` ^8.4.0: two screens (`/` and `/ideas`), approved in CLAUDE.md.

## Manual setup required before deploy

- Optional: `npx wrangler secret put GITHUB_READ_TOKEN` (read-only token for public repos) to avoid GitHub's unauthenticated rate limit.
- Turn on Cloudflare Web Analytics for the `*.workers.dev` hostname.
- Both `yangxdev/greenlight-status` and `yangxdev/greenlight` must be public.

## Blockers / open questions

- Unverified against the live repo, as the blueprint notes: the Critic table headers and `watchlist.md` bullet labels, the report JSON field names, the filed threshold of 14, and that the `greenlight:repo` marker and repo homepage are still written. Compare the live page with `analysis/` and `reports/` after the first deploy.
