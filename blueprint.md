# greenlight-status: blueprint

> Idea: yangxdev/greenlight#5 · One-line pitch: one public page that shows what Greenlight's pipeline did, which ideas were scored and why most were rejected, and which products are live, for people who won't read GitHub.

## Scope

- Two screens, read-only: **Overview** (`/`) and **Ideas** (`/ideas`).
- The Worker builds one JSON document from the public repo `SOURCE_REPO` (default `yangxdev/greenlight`) at `GET /api/status`: idea issues, Critic tables, the watchlist, the latest weekly report and live links.
- Overview: headline, a count per pipeline state, the latest Ideas run (date, scored, filed, rejected), live products with the latest verdict and reason, "Updated <time>".
- Ideas: every scored card, newest run first, with four scores, total and verdict; filed rows marked; then the watchlist. Every row links to its source file on GitHub.
- The JSON is cached 10 minutes in the Worker. If GitHub fails, the last good copy is served with `stale: true`.
- Nothing is stored and nothing is written to GitHub.

## Identity

- **Tag:** `greenlight pipeline log`
- **Description:** A read-only page showing what the Greenlight pipeline is working on, which ideas it scored and rejected, and which products are live.
- **Headline:** `What the pipeline did, in *public*.`
- **Sections:**
  - Overview (`/`): `01 Pipeline: one count per state`, `02 Latest run: the newest Ideas run in numbers`, `03 Live: products that shipped, with the latest verdict`.
  - Ideas (`/ideas`): `01 Scored: every card the Critic scored, newest run first`, `02 Watchlist: near misses and what each still needs`.
- `SITE_NAME` is `greenlight-status`. Header nav: `overview`, `ideas`. Footer links: `source` (this product's repo), `greenlight` (the `SOURCE_REPO` repo) and `readme` (its README); the footer note says the page is read from GitHub and cached for ten minutes.

## Data model

**Storage:** none. No MongoDB, no R2, no `localStorage` except the theme the template already keeps. Every view is built from GitHub through the 10-minute in-memory cache.

All types go in `shared/api.ts` (types only):

```ts
export const IDEA_STATES = [
  'idea', 'approved', 'blueprint-ready', 'blueprint-ok', 'building', 'live', 'stuck', 'archived',
] as const
export type IdeaState = (typeof IDEA_STATES)[number]

export interface PipelineIdea {
  number: number
  name: string // title without the "[idea] " prefix
  states: IdeaState[] // 1+, in IDEA_STATES order; "live" and "stuck" may both appear
  url: string // issue html_url
}

export interface CriticRow {
  name: string
  pain: number
  competition: number
  mvp: number
  reach: number
  total: number // leading integer of "13" or "13/20"
  verdict: string // free text, may be ""
}

export interface CriticRun {
  date: string // YYYY-MM-DD, from the file name
  file: string // e.g. 2026-10-02-critic.md
  url: string // https://github.com/<repo>/blob/main/analysis/<file>
  rows: CriticRow[]
}

export interface WatchEntry {
  name: string
  bestScore: number | null // 13 from "13/20 on 2026-09-30 …"
  bestScoreDate: string | null
  lastEvidence: string
  problem: string
  needs: string
}

export interface LiveProduct {
  issue: number
  name: string
  issueUrl: string
  liveUrl: string | null // repo homepage (https only); null → link issueUrl instead
  verdict: 'keep' | 'improve' | 'archive' | null // from the latest report; null if absent
  reason: string | null
}

export interface StatusResponse {
  sourceRepo: string
  fetchedAt: string // ISO 8601, when GitHub was last read successfully
  stale: boolean
  filedThreshold: number // 14
  ideas: PipelineIdea[] // newest issue first
  runs: CriticRun[] // newest first; runs without a valid table are omitted
  watchlist: WatchEntry[]
  watchlistUrl: string
  report: { week: string; summary: string } | null
  live: LiveProduct[]
}
```

Limits: only the 100 newest issues are read (no paging; older ideas are not shown, and the README says so). Read at most the 12 newest `*-critic.md` files (keeps the Worker under its subrequest limit). A row is `filed` when `total >= filedThreshold`; this is derived in the UI, never stored. State counts are derived from `ideas` (an issue with two state labels counts once in each; counts need not sum to the number of ideas).

## Routes

| Kind | Path | Purpose | Request | Response |
|------|------|---------|---------|----------|
| page | `/` | Overview | – | – |
| page | `/ideas` | Scored cards and watchlist | – | – |
| api  | `GET /api/status` | assembled pipeline document | – | `StatusResponse`, or 503 `{ error }` when GitHub failed and nothing is cached |
| api  | `GET /api/health` | smoke test (keep) | – | `HealthResponse` |

`SOURCE_REPO` is a plain var in `wrangler.jsonc` (`"vars": { "SOURCE_REPO": "yangxdev/greenlight" }`) and optional `GITHUB_READ_TOKEN` a secret; both go in `worker/env.ts` (the token optional). If `SOURCE_REPO` does not match `^[\w.-]+/[\w.-]+$`, use the default.

Upstream requests (all send `User-Agent: greenlight-status`, and `Authorization: Bearer <token>` to `api.github.com` only when the token is set):

1. `https://api.github.com/repos/<repo>/issues?state=all&per_page=100`
2. `https://api.github.com/repos/<repo>/contents/analysis` and `.../contents/reports`
3. `https://raw.githubusercontent.com/<repo>/main/analysis/<file>`, `.../analysis/watchlist.md`, `.../reports/<file>`
4. For each live issue: `https://api.github.com/repos/<repo>/issues/<n>/comments?per_page=100`, then `https://api.github.com/repos/<owner>/<name>/` taken from the last `<!-- greenlight:repo=<owner>/<name> -->` marker.

Only file names matching `^\d{4}-\d{2}-\d{2}-critic\.md$` and `^\d{4}-W\d{2}\.json$` are fetched, which also keeps links safe. Only the first 100 comments of an issue are read (documented limit).

## Tasks

Ordered, each finishable in under about an hour by the Factory, each ending with `npm run check` green.

### Task 1: Shared types and the markdown/issue parsers

- **Do:** Add the types above to `shared/api.ts`. Write pure, framework-free parsers in `worker/status/parse.ts`: `parseIdeaIssues(json, repo)` (keep `[idea] ` titles, drop entries with `pull_request`, map labels to states, open issue with no state label → `idea`, closed with none → `archived`, ignore everything else), `parseCriticTable(markdown)` (first table whose header cells, lowercased, include `pain`, `competition`, `mvp`, `reach`, `total`; name column is `name` or `idea`; strip `**`/backticks; total and scores are leading integers; rows with a non-numeric score are dropped; no table → `[]`), `parseWatchlist(markdown)` (`## name` headings with the four bold-label bullets; missing bullets become `""`/`null`), `parseReport(json)` (validate `week`, `summary`, `products[]` by hand; bad entries dropped) and `findRepoMarker(comments)` (last match of the marker regex). Validate every input as `unknown`; a malformed piece drops itself and never throws.
- **Files:** `shared/api.ts`, `worker/status/parse.ts`, `worker/status/parse.test.ts`
- **Satisfies:** AC1, AC2, AC3, AC4, AC5, AC6

### Task 2: GitHub reader and assembler

- **Do:** In `worker/status/github.ts` write `buildStatus(env, fetchImpl)`: run the requests listed under Routes, apply the 12-file cap, build `runs` (newest first by file date), `watchlist` (empty and `watchlistUrl` kept when the file is 404), the newest report, and `live` (one entry per issue whose states include `live`: marker → repo → `homepage` if it starts with `https://`, else `liveUrl: null`; join verdict and reason from the report by issue number). A single failed critic file, report or live lookup only drops that piece; failure of the issues request or the `contents/analysis` listing fails the whole build. Add `SOURCE_REPO` and `GITHUB_READ_TOKEN?` to `worker/env.ts` and the var to `wrangler.jsonc` (do not change `name`).
- **Files:** `worker/status/github.ts`, `worker/status/github.test.ts`, `worker/env.ts`, `wrangler.jsonc`
- **Satisfies:** AC7, AC8, AC9, AC10, AC11

### Task 3: `/api/status` route and cache

- **Do:** In `worker/status/cache.ts` keep a module-level `{ data, at }` and one in-flight promise shared by concurrent requests. Take the clock as a parameter (`now: () => number`, default `Date.now`) so tests inject time. Fresh (< 10 min) → return it. Otherwise rebuild; on success store with `fetchedAt` now and `stale: false`; on failure return the cached copy with `stale: true`, or `errorResponse(503, 'GitHub is not answering right now. Try again in a few minutes.')` with nothing cached. Export `resetStatusCache()` for tests. Register `GET /api/status` in `worker/index.ts` via `worker/routes/status.ts`; responses carry `cache-control: no-store`. Keep `/api/health`.
- **Files:** `worker/status/cache.ts`, `worker/routes/status.ts`, `worker/index.ts`, `worker/status/cache.test.ts`, `worker/worker.test.ts`
- **Satisfies:** AC12, AC13, AC14, AC15

### Task 4: Client state for the status document

- **Do:** Add `react-router` (approved: two screens). Create `src/features/status/statusSlice.ts` with a `fetchStatus` thunk through `src/lib/api.ts`, state `{ status: 'idle'|'loading'|'ready'|'error', data, error }`, and selectors: `selectStateCounts` (one count per `IDEA_STATES` entry, in order, from `ideas`), `selectLatestRun` (date, scored, filed, rejected using `filedThreshold`), `selectFiled(row, threshold)`. Register the slice in `src/app/store.ts`. A refetch keeps the old `data` while loading.
- **Files:** `package.json`, `src/features/status/statusSlice.ts`, `src/features/status/statusSlice.test.ts`, `src/app/store.ts`, `src/lib/api.ts`
- **Satisfies:** AC16, AC17, AC18

### Task 5: Identity, routing and Overview

- **Do:** Set `SITE_NAME`, `SITE_TAG`, `SITE_DESCRIPTION` from Identity. Route `/` and `/ideas` with `BrowserRouter` in `App.tsx`; `SiteHeader` nav links to both; the footer as in Identity. Dispatch `fetchStatus` once on mount of a shared layout. Overview: `Hero` with the headline and a one-sentence lede; no primary button. Section 01 `CellGrid` of `Stat`s (state name as caption, count as figure); section 02 `DetailList` with date (link to the run file), scored, filed (accent), rejected; section 03 `RuledList` of live products (name as link to `liveUrl ?? issueUrl`, verdict as `chipClass`, reason below). `Note` "Updated <time>" with `<time dateTime>`; when `stale`, a second `Note`: "GitHub did not answer, so this is the last copy we have." Loading: `Skeleton`s. Error with no data: `EmptyState` with the server message and a ghost "Try again" button. Empty states: "No Ideas run yet" and "Nothing live yet".
- **Files:** `src/app/site.ts`, `src/App.tsx`, `src/features/status/Overview.tsx`, `src/features/status/StatusNotes.tsx`, `src/features/status/Overview.test.tsx`, `src/components/shell/*` (only the nav/footer props)
- **Satisfies:** AC19, AC20, AC21, AC22, AC23

### Task 6: Ideas screen

- **Do:** `/ideas` Hero (short headline "Every idea, *scored*." and a lede), then section 01: a `Note` stating "Cards with a total of 14 or more are filed as issues." (number from `filedThreshold`), then per run a mono date heading linking to the run file and a `RuledList` of rows: `meta` = total as `13/20`, title = name, body = `Pain 3 · Competition 3 · MVP 4 · Reach 3` and the verdict; filed rows get the accent on the total; each row's name is an `<a>` to the run file. Section 02 Watchlist: `RuledList` with name, best score and date, last evidence, `Needs:` line, each linking to `watchlistUrl`. Empty states: "No Ideas run yet" and "The watchlist is empty". Same loading/error/stale handling as Overview (reuse `StatusNotes`). Rows must wrap at 320px.
- **Files:** `src/features/status/Ideas.tsx`, `src/features/status/Ideas.test.tsx`, `src/App.tsx`
- **Satisfies:** AC24, AC25, AC26, AC27

### Task 7: README and polish

- **Do:** Fill in `README.md` per CLAUDE.md (description equal to `SITE_DESCRIPTION`; Privacy: "stores nothing; the Worker reads public GitHub data and caches it in memory for ten minutes"; Contributing: issues; note the optional `GITHUB_READ_TOKEN` and `SOURCE_REPO` in Run it locally). State in the README that only the 100 newest issues and the first 100 comments per live issue are read. Make sure both pages use `<time>` for dates, links carry `rel="noopener"`, and row text has no fixed widths or `whitespace-nowrap`. Add `src/App.test.tsx` for AC28. Keep the Publisher marker blocks untouched.
- **Files:** `README.md`, `src/features/status/*.tsx`, `src/App.test.tsx`
- **Satisfies:** AC28

## Acceptance criteria

Parsers (Task 1):

- **AC1:** Given a Critic table with `Name` and `Total` = `13`, and another with `Idea` and `13/20`, when parsed, then both give a row with the right `name` and `total: 13`.
- **AC2:** Given a file with no table containing all five score headers, or a row with a non-numeric score, when parsed, then no rows are returned for the file, or only that row is dropped, and nothing throws.
- **AC3:** Given a markdown file with two tables, when parsed, then only the first table with the required headers is read.
- **AC4:** Given issues including a pull request, a title without `[idea] `, one closed with no state label, one open with no state label, and one labelled both `live` and `stuck`, when parsed, then the result has only the ideas, with states `archived`, `idea` and `["live","stuck"]` respectively.
- **AC5:** Given a watchlist with two entries, one missing `**Needs:**`, when parsed, then both appear, the first with `bestScore: 13` and `bestScoreDate: "2026-09-30"` from `13/20 on 2026-09-30 …`, the second with `needs: ""`.
- **AC6:** Given comments with two `greenlight:repo` markers, when searched, then the last one is returned; with none, `null`. Given a report JSON with an entry missing `verdict`, then that entry is dropped and `week` is kept.

Assembler (Task 2), with `fetch` mocked:

- **AC7:** Given a directory listing with `2026-10-02-critic.md`, `2026-10-01-critic.md`, `notes.md` and `../x-critic.md`, when built, then only the two valid files are requested and `runs` is newest first.
- **AC8:** Given 15 valid critic files, when built, then only the 12 newest are fetched.
- **AC9:** Given one critic file that returns 500 and one that is valid, when built, then `runs` holds the valid one and the build succeeds.
- **AC10:** Given a live issue whose comments carry a marker and whose repo has `homepage: "https://x.workers.dev"`, when built, then `liveUrl` is that URL; with `homepage: "javascript:alert(1)"`, empty, or no marker, `liveUrl` is `null`; the verdict and reason come from the report entry with the same issue number.
- **AC11:** Given `watchlist.md` returns 404 and no report exists, when built, then `watchlist` is `[]`, `report` is `null`, `verdict` is `null` and the build succeeds. Given the issues request fails, then the build rejects.

Route and cache (Task 3):

- **AC12:** Given a working GitHub mock, when `GET /api/status` is called twice within 10 minutes, then the second response makes no new upstream request and `stale` is `false`.
- **AC13:** Given a cached copy older than 10 minutes and a failing GitHub, when called, then the response is 200 with the old data, its original `fetchedAt` and `stale: true`.
- **AC14:** Given nothing cached and a failing GitHub, when called, then the status is 503 and the body is `{ error: <non-empty string> }`.
- **AC15:** Given two concurrent calls with an empty cache, then upstream is read once. Given `GITHUB_READ_TOKEN` is set, then requests to `api.github.com` carry the bearer header and requests to `raw.githubusercontent.com` do not; unset, no request has it. `GET /api/health` still returns `{ ok: true }`.

Client state (Task 4):

- **AC16:** Given `ideas` with states `idea`, `idea`, `live`, `live+stuck`, when `selectStateCounts` runs, then it returns the counts in `IDEA_STATES` order (`idea` 2, `live` 2, `stuck` 1, others 0).
- **AC17:** Given the newest run has totals 15, 14, 13, 9 and threshold 14, when `selectLatestRun` runs, then `scored` is 4, `filed` 2, `rejected` 2; with no runs it returns `null`.
- **AC18:** Given `fetchStatus` is rejected after a success, when the reducer runs, then `data` is kept and `error` is set.

Screens (Tasks 5 to 7):

- **AC19:** Given the status is loading with no data, when `/` renders, then skeletons show and no count appears.
- **AC20:** Given a ready status, when `/` renders, then the headline, one `Stat` per state in pipeline order with the right counts, and the latest run's date, scored, filed and rejected are visible.
- **AC21:** Given two live products, one with a `liveUrl` and one without, when `/` renders, then the first name links to `liveUrl`, the second to its issue, and each shows its verdict and reason; with `live: []` the text "Nothing live yet" shows, and with `runs: []` "No Ideas run yet".
- **AC22:** Given `stale: true`, when `/` renders, then the stale note shows; given `stale: false`, it does not. "Updated" shows in a `<time>` element whose `dateTime` equals `fetchedAt`.
- **AC23:** Given the fetch fails with 503 and no data, when `/` renders, then an alert shows the server message and "Try again" dispatches the fetch again.
- **AC24:** Given runs of 2026-10-02 and 2026-10-01, when `/ideas` renders, then the newer run's rows come first and each row shows name, the four scores, `total/20` and the verdict.
- **AC25:** Given a threshold of 14, when `/ideas` renders, then the text states 14 and rows with total ≥ 14 carry the filed marker while 13 does not. Changing the threshold in the mock changes both.
- **AC26:** Given a watchlist entry, when `/ideas` renders, then name, best score, date, last evidence and needs show; with `watchlist: []` the text "The watchlist is empty" shows.
- **AC27:** Given a run and a watchlist entry, when `/ideas` renders, then each row's link `href` points to `https://github.com/<sourceRepo>/blob/main/analysis/<file>` (the watchlist to `watchlistUrl`) and has `rel` containing `noopener`.
- **AC28:** Given the app renders `/` and `/ideas` via the header nav, then the nav links switch screens without a reload, and the header shows the wordmark `greenlight-status` and the tag from `site.ts`.

## Non-goals

- No accounts, login or admin actions. It never writes to GitHub: no approve buttons, no labels.
- No MongoDB, R2 or any stored copy of the data; no webhooks or cron.
- No charts beyond tables and counts.
- No reading of the idea cards' full text (`analysis/<date>.md`); no filtering or search.
- No third screen, no i18n, no per-product detail pages.
- No client-side click tracking code: outbound links are plain links.

## Setup notes

- The repo `yangxdev/greenlight-status` must be public. The `SOURCE_REPO` repo (`yangxdev/greenlight`) must be public too, since the Worker reads it without credentials.
- Optional but recommended: create a fine-grained, read-only GitHub token for public repositories (no permissions beyond public read) and run `npx wrangler secret put GITHUB_READ_TOKEN`. Without it, GitHub's 60 requests/hour per IP limit applies and shared Cloudflare egress IPs may hit it; the page then shows stale or error states.
- Turn on Cloudflare Web Analytics for the `*.workers.dev` hostname.
- Unverified until a person checks them against the live repo:
  1. The Critic table headers (`Pain`, `Competition`, `MVP`, `Reach`, `Total`) and the `watchlist.md` bullet labels are as the idea describes; open the live page after the first deploy and compare with `analysis/` and `reports/`.
  2. The filed threshold of 14 (`filedThreshold`) matches what the Critic currently uses to file issues.
  3. The Publisher still sets the repo `homepage` and the Architect still writes the `greenlight:repo` marker, so live links resolve.

## Success metric

In Cloudflare Web Analytics, over the 2 weeks after the LinkedIn post and Show HN: visits with referrers LinkedIn and `news.ycombinator.com`, and the share of visitors who also open `/ideas`. Keep going at 200 visits with at least 25% of visitors reaching `/ideas`. Clicks through to GitHub are not tracked by Web Analytics; read them from the source repo's traffic referrers instead.
