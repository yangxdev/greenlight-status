<!--
  The Factory fills in this README from blueprint.md (see CLAUDE.md → "README"). Replace every line in brackets;
  keep the section order. The greenlight:live and greenlight:screenshots blocks are written by the Publisher after
  each deploy (live link, screenshots of the live site): keep their markers and leave their contents alone.
-->

# greenlight-status

A dashboard of the Greenlight pipeline: every project and the stage it is at, what each step did, and the ideas the Critic scored.

<!-- greenlight:live -->
**[Open greenlight-status → greenlight-status.yangxdev.workers.dev](https://greenlight-status.yangxdev.workers.dev)**
<!-- /greenlight:live -->

<!-- greenlight:screenshots -->
<img alt="greenlight-status, first screen on a desktop browser" src="docs/screenshots/desktop-light.png">

<p align="center">
<img alt="greenlight-status on a phone" src="docs/screenshots/mobile-light.png" width="320">
</p>

<sub>Screenshots of the live site, refreshed on every deploy.</sub>
<!-- /greenlight:screenshots -->

## What it does

- **Pipeline:** the ten stages in one row (Scout … Observer), each with its last run and a status dot. A stage
  opens its recent runs. Under it, every project as a tile: its number and state, its Critic score, a ten-segment bar
  of how far it got, and what it is doing now. Projects that need you (the `approved` and `blueprint-ok` gates, or
  `stuck`) come first and carry the accent. Filter by active, needs you, in progress, live or archived, or search.
- **A project** (`/p/<issue>`): each stage's reports from the issue (the Architect's tasks, the Reviewer's notes,
  the Factory's pull requests, the Inspector's verdict, the live link), the idea as written, the product repo's
  pull requests and runs, and the discussion.
- **Changes:** a live product's changes (sub-issues of its idea issue) are listed on its page and open their own page
  with the same stages. A change waiting for you shows on its product's tile.
- **Ideas:** every card the Critic scored, newest run first, and the watchlist of near misses.
- **For the owner, signed in with GitHub:** write a new idea in a form (the same fields as GitHub's Idea form, with
  the repo name it will get, and "approve it now"), request a change to a live product, approve an idea or a change,
  start a build, redo a blueprint, retry a stuck project, archive one, and comment feedback for the Architect.

## How to use it

1. Open **pipeline**. The header says how many projects need you; they are the first tiles.
2. Open a tile to see what each stage did. Signed in, the button at the top is the next gate: **Approve**,
   **Start the build** or **Retry**.
3. **New idea** files an issue as you. Tick **Approve it now** to start the Architect straight away.

Everyone can read the dashboard. Only the owner of the pipeline repo (`SOURCE_REPO`) can sign in; anyone else is
turned away at the callback and their token is dropped. Only the 100 newest issues and the 300 newest comments of the
pipeline repo are read for the board, so very old projects may show fewer stage reports than they had.

## Privacy

Nothing is stored on a server. The Worker reads GitHub and keeps the board in memory for five minutes and a project for
one. Signing in puts your GitHub login and a user token, encrypted with `SESSION_SECRET`, in an HttpOnly cookie that
expires with the token (at most eight hours); signing out deletes it. The browser also remembers your light or dark
theme. Page views are counted by Cloudflare Web Analytics, which sets no cookies.

## Contributing

Open an issue if a stage looks wrong, a page is confusing, or you want something added. Pull requests are welcome too.

## Sign-in

Writes go to GitHub as you, through a GitHub App's user token, so the labels you add from here trigger the Architect and
the Factory exactly like labels added on github.com. The Worker holds no write token of its own. One-time setup:

1. GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**. Homepage: the live URL. Callback URL:
   `https://<live host>/api/auth/callback`. Keep "Expire user authorization tokens" on. Turn the webhook off.
   Repository permissions: **Issues: Read and write** (nothing else). Installable: only on this account.
2. Note the **Client ID** and generate a **client secret**.
3. **Install** the App on the pipeline repo only (Install App → Only select repositories → `greenlight`). A user token
   reaches only the repositories the App is installed on.
4. Put the Client ID in `wrangler.jsonc` → `vars.GITHUB_APP_CLIENT_ID`, then
   `npx wrangler secret put GITHUB_APP_CLIENT_SECRET` and `npx wrangler secret put SESSION_SECRET` (any long random
   string, e.g. `openssl rand -base64 32`).
5. Check it once: approve an idea from the dashboard and confirm `architect.yml` runs. Its gate requires the label to
   come from the repo owner, and a GitHub App user token acts as you, so it should.

Without these three settings the dashboard works read-only and shows no sign-in.

## Run it locally

Needs Node.js 22.18 or later.

```bash
npm ci
npm run dev     # the app at http://localhost:5173 (the /api Worker is not running)
npm run check   # lint, tests and a production build
```

`npm run build && npx wrangler dev` serves the built app together with the `/api` Worker.

Two settings control where the Worker reads from:

- `SOURCE_REPO` is a plain variable in `wrangler.jsonc`. It defaults to `yangxdev/greenlight`.
- `GITHUB_READ_TOKEN` is a read-only GitHub token for public repositories. Strongly recommended: a board rebuild is
  about 20 requests, and without a token GitHub's limit of 60 an hour per IP applies, shared with whoever else uses
  Cloudflare's egress. Set it with `npx wrangler secret put GITHUB_READ_TOKEN`, or put it in `.dev.vars` locally.
- Sign-in needs `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` and `SESSION_SECRET` (see Sign-in).

## Built with

React 19, Vite, Redux Toolkit, React Router and Tailwind CSS v4, served by a Cloudflare Worker.

---

Made by [yangxdev](https://github.com/yangxdev). [MIT licensed](LICENSE.md).
