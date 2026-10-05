# greenlight-status: blueprint

> Idea: yangxdev/greenlight#5 · One-line pitch: the Greenlight pipeline seen from above, every project at its stage, with the owner able to act on the gates and file ideas without opening GitHub.

v2. v1 was a read-only page in the `page` layout (a hero and numbered sections presenting the pipeline). The owner
asked for a dashboard instead: many projects at a glance, each step openable in detail, and a better way to file ideas
than GitHub's issue form. v2 was built by hand rather than by the Factory, because it adds sign-in (the Architect's
rules forbid accounts) and moves the product to the template's new `app` layout.

## Scope

- **Pipeline** (`/`): the ten stages as a strip of numbered cells with their last run; a cell opens its recent runs in
  a drawer. Every project as a tile: number, state, Critic score, a ten-segment progress bar and what it is doing now.
  Projects that need the owner first. Filters (active, needs you, in progress, live, archived) and search.
- **Project** (`/p/:number`): each stage's status and its reports from the issue, the idea's sections, the product
  repo's pull requests and runs, the discussion.
- **Ideas** (`/ideas`): scored cards per Critic run and the watchlist, as tabs.
- **Owner only**, after GitHub sign-in: new idea (drawer), approve, start the build, redo the blueprint, retry, archive,
  comment.

## Identity

- **Layout:** `app`.
- **Tag:** `greenlight pipeline`
- **Description:** A dashboard of the Greenlight pipeline: every project and the stage it is at, what each step did, and the ideas the Critic scored.
- **Screens:**
  - `pipeline` · "Pipeline": the stage strip and the project tiles. Primary action (owner): **New idea**.
  - `ideas` · "Ideas": `Segmented` tabs Scored / Watchlist over ruled rows.
  - (no tab) · the project's name: stages as ruled rows in a `Pane`, then panes Idea, Builds, Discussion. Primary
    action (owner): the next gate (**Approve**, **Start the build** or **Retry**).

## Data model

**Storage:** none on the server. Board and project documents live in Worker memory (5 min and 1 min). The session is
an AES-GCM-sealed HttpOnly cookie `{ login, token, exp }`. Types in `shared/api.ts`: `StatusResponse` (stages,
projects, runs, watchlist, report), `ProjectSummary`, `ProjectDetail`, `MeResponse`, `NewIdea`, `ProjectAction`.

A project's ten steps are derived (`worker/status/project.ts`), never stored:
- Scout/Analyst/Critic are `done` for Critic-filed issues, `skipped` for hand-written ones; Board is `done`.
- A trusted comment (the workflow bot, or OWNER/MEMBER/COLLABORATOR) with an actor marker (`**Architect:**`,
  `**Factory (fix):**`, `**Observer, 2026-W40:**` …) marks its stage `done` at that time.
- The state label sets the active stage: `idea` → Board waiting (approve), `approved` → Architect running,
  `blueprint-ready` → Reviewer waiting (blueprint-ok), `blueprint-ok`/`building` → Factory or Inspector running,
  `live` → Observer, `stuck` → the newest stage that reported. Later stages reset to pending.

## Routes

| Kind | Path | Purpose | Request | Response |
|------|------|---------|---------|----------|
| page | `/`, `/ideas`, `/p/:number` | screens | – | – |
| api  | `GET /api/status` | board document | – | `StatusResponse` or 503 |
| api  | `GET /api/projects/:number` | one project | – | `ProjectDetail`, 404, 503 |
| api  | `GET /api/me` | session | – | `MeResponse` |
| api  | `GET /api/auth/login?return=` | to GitHub | – | 302 |
| api  | `GET /api/auth/callback` | code → token, owner only | – | 302 + cookie |
| api  | `POST /api/auth/logout` | – | – | 204 |
| api  | `POST /api/ideas` | file an idea as the owner | `NewIdea` | 201 `NewIdeaResponse` |
| api  | `POST /api/projects/:number/actions` | gate, retry, archive | `{ action }` | 200, 409 |
| api  | `POST /api/projects/:number/comments` | feedback | `{ body }` | 201 |
| api  | `GET /api/health` | smoke test (keep) | – | `HealthResponse` |

Writes need the owner's session and `Origin` equal to the Worker's origin. GitHub errors come back as 502 with
GitHub's message; a 401 from GitHub clears the session.

Board reads: issues (100), `contents/analysis`, `contents/reports`, up to 12 critic files, the watchlist, the newest
report, up to 3 pages of repo-wide comments, and `actions/runs` (100): at most about 21 subrequests.

## Tasks

### Task 1: Board data from labels, comments and runs

- **Do:** shared types; `parseComments`, `commentEvents`, `deriveSteps`, `summarizeProject`; `parseWorkflowRuns`,
  `buildStages`; the assembler in `worker/status/github.ts`.
- **Files:** `shared/api.ts`, `worker/status/{project,runs,github,parse}.ts` and tests
- **Satisfies:** AC1, AC2, AC3

### Task 2: Project detail and caches

- **Do:** `buildProject` (issue, comments, product pulls and runs, body sections); `loadStatus`, `getProject`,
  `invalidate` in `worker/status/cache.ts`; `GET /api/projects/:number`.
- **Files:** `worker/status/{detail,cache}.ts`, `worker/routes/status.ts`, tests
- **Satisfies:** AC4, AC5

### Task 3: Sign-in and owner writes

- **Do:** sealed cookies, the OAuth web flow for a GitHub App, `/api/me`, and the three write routes.
- **Files:** `worker/auth/session.ts`, `worker/routes/{auth,write}.ts`, `worker/env.ts`, `worker/index.ts`, tests
- **Satisfies:** AC6, AC7, AC8

### Task 4: App layout and screens

- **Do:** the template's app shell (`AppShell`, `AppHeader`, `ViewHeader`, `Pane`, `Drawer`, `StatusDot`,
  `TextArea`); Board, StageStrip, ProjectTile, Project, NewIdeaDrawer, Ideas; session controls; `RichText`.
- **Files:** `src/**`
- **Satisfies:** AC9, AC10, AC11, AC12

## Acceptance criteria

- **AC1:** Given trusted comments with actor markers and a state label, when steps are derived, then the gates wait
  for the owner, a stuck project is stuck at its newest reporting stage, and a fixed failure is not shown as stuck.
- **AC2:** Given an untrusted comment with a marker, then it moves no stage and sets no repo or live link.
- **AC3:** Given workflow runs, then skipped runs are left out, and the Factory/Inspector/Publisher cells use comments.
- **AC4:** Given an issue that is not an idea, or a missing one, then `/api/projects/:n` answers 404.
- **AC5:** After a write, the next board read rebuilds; if GitHub then fails, the old copy is served as stale.
- **AC6:** Given a callback for someone other than the owner, then no session cookie is set.
- **AC7:** Given a write without the owner's session, or from another origin, then it is refused before GitHub is called.
- **AC8:** A new idea is filed with the Idea form's markdown and the `idea` label, and `approved` when asked;
  `blueprint-ok` is refused unless a reviewed blueprint is waiting; retry removes and re-adds the right gate.
- **AC9:** The board lists needs-you projects first, filters and searches, and opens a stage's runs.
- **AC10:** Only the owner sees New idea, the gate buttons and the comment form; archive asks first.
- **AC11:** Issue and comment text renders as text: no HTML, only http(s) links.
- **AC12:** No horizontal scroll at 375px; both themes.

## Non-goals

- No server storage, no webhooks: the dashboard reads GitHub on demand.
- No editing of blueprints or code from the dashboard; no merging pull requests.
- No accounts beyond the one owner; no roles.
- No reading of the idea cards' full text (`analysis/<date>.md`).

## Setup notes

- Create the GitHub App and set the three sign-in settings (README → "Sign-in"). Until then the dashboard is read-only.
- Set `GITHUB_READ_TOKEN`: the board is about 20 GitHub requests per rebuild.
- Unverified until checked on the live repo: that labels added through the App's user token pass the workflows'
  `github.actor == github.repository_owner` gate (approve one idea from the dashboard and watch `architect.yml`).

## Success metric

The owner stops opening GitHub to run the pipeline: over the 2 weeks after deploy, at least 80% of `approved` and
`blueprint-ok` labels on the pipeline repo are added through the dashboard (the issue timeline shows them as made by
the App), and every new hand-written idea is filed from it.
