# Build report

- **Blueprint:** blueprint.md @ b64f0f5 (change spec changes/15.md)
- **Greenlight issue:** yangxdev/greenlight#15
- **Run:** https://github.com/yangxdev/greenlight-status/actions/runs/37608166352
- **Result:** ✅ complete

## Tasks

| # | Task | Status | Commit | Notes |
|---|------|--------|--------|-------|
| 1 | Note route in the Worker | done | eb01548 | `POST /api/notes`, `validateNote`, `noteBody`, shared types. The `MVP` heading and error rename were also made here, since they sit in the same file; Task 2 holds their tests. |
| 2 | Keep notes out of the board, rename MVP on the server | done | fb676c8 | Tests for the parser, the status build and the MVP heading and message. |
| 3 | Quick note drawer | done | 1d1f984 | `createNote` thunk, `QuickNoteDrawer`, tests. |
| 4 | Wire the action and rename the field | done | 5374ef4 | Quick note button and drawer on the Pipeline view (owner only); the New idea field is now **MVP**. |

README updated in 043b0ce.

## Acceptance criteria

| Criterion | Covered by test | Status |
|-----------|-----------------|--------|
| CH1 | `worker/routes/auth.test.ts` › "CH1: files a note as the owner…" | pass |
| CH2 | `worker/routes/auth.test.ts` › "CH2: cuts the title to 60 characters…" | pass |
| CH3 | `worker/routes/auth.test.ts` › "CH3: refuses cross-site requests…" | pass |
| CH4 | `worker/routes/auth.test.ts` › "CH4: rejects a blank note…" | pass |
| CH5 | `worker/routes/auth.test.ts` › "CH5: answers GitHub failures as createIdea does" | pass |
| CH6 | `worker/status/parse.test.ts` › "CH6: ignores an open [note] issue…"; `worker/status/cache.test.ts` › "CH6: leaves a [note] issue out…" | pass |
| CH7 | `worker/routes/auth.test.ts` › "CH7: writes the MVP heading…" | pass |
| CH8 | Existing `createIdea` (approve → label `idea` + `approved`, 201), changes, actions, comments and health tests, unchanged | pass |
| CH9 | `QuickNoteDrawer.test.tsx` › "CH9: opens on Idea…" | pass |
| CH10 | `QuickNoteDrawer.test.tsx` › "CH10: asks for the note…" | pass |
| CH11 | `QuickNoteDrawer.test.tsx` › "CH11: files an idea note…" and "CH11: says evidence…" | pass |
| CH12 | `QuickNoteDrawer.test.tsx` › "CH12: keeps the note on an error…" | pass |
| CH13 | `Board.test.tsx` › "CH13: offers Quick note…" | pass |
| CH14 | `NewIdeaDrawer.test.tsx` › "CH14: labels the field MVP…" | pass |
| CH15 | `NewIdeaDrawer.test.tsx` › "files the idea, approved if asked, and opens its page" (label now `MVP`) | pass |

## Checks (last run of `npm run check`)

- lint: pass
- test: pass (137 tests)
- build: pass (bundle size: 106.67 kB gzip JS; the last full check ran before the final component edits, which add little)

## Deviations from the blueprint

None. One existing test changed: `NewIdeaDrawer.test.tsx` now queries `MVP` instead of `MVP in one day`, because the change renames that label.

## New dependencies

None.

## Manual setup required before deploy

- Merge greenlight's `claude/elegant-mendel-l8memg` branch and re-run its **Setup labels** workflow so the `note` label exists.
- After deploy, file one Idea note and one Evidence note and check that `notes.yml` runs on each and the next-step text is accurate.

## Blockers / open questions

None.
