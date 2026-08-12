# Phase 7 — built, 2026-08-04

**Built:**
- `core/ws.ts`: `WebSocketServer` (the `ws` package) attached to the same
  `http.Server` `core/http.ts` serves REST from, one port
  (`JARVIS_DASHBOARD_PORT`, default 8787). Subscribes to `Gate`'s new
  `"approval.new"`/`"approval.resolved"` events and re-broadcasts them as
  `ServerEvent`s; the only thing it accepts back from a client is
  `approval.decide`, relayed straight into `gate.decide()` — no approval
  logic lives in `core/ws.ts` itself.
- `core/gate/gate.ts`: now `extends EventEmitter`. `propose()` emits
  `"approval.new"` (wire-shaped via a new `rowToRequest` mapper,
  `ApprovalRow`'s snake_case DB shape -> the public camelCase
  `ApprovalRequest`); the expiry timer and `settlePending()` (covering
  approve/reject/expire-via-decide) emit `"approval.resolved"`. Also
  gained `listPendingRequests()` — the same `rowToRequest` mapping over
  `listPending()`, for a fresh tab's backfill.
- `core/http.ts`: `GET /api/events` (`Memory`'s new `recentEvents(limit)`,
  all sessions, newest-first — the timeline's data source), `GET
  /api/skills` (`SkillRegistry`'s new `listHealth()`, loaded and disabled
  skills with why), `GET /api/approvals` (`gate.listPendingRequests()`).
  CORS-open (`access-control-allow-origin: *`) since every response is
  either the owner's own history or a pending-approval summary, never a
  credential, and `ui/`'s dev server runs on a different origin/port than
  `core`.
- `core/main.ts`: wires both servers in, broadcasts `transcript` (both
  the heard utterance and the spoken reply, tagged with a new `speaker`
  field) and `thought` (`SkillRoutingTrace`, already computed by
  `dispatch()` and previously discarded — reports the real lane and
  chosen skill/intent or "no skill matched," not a fabricated narration).
- `shared/types.ts`: `transcript`'s `ServerEvent` gained `speaker: "owner"
  | "jarvis"` — the original `{text, final}` shape had no way to tell the
  two halves of a conversation apart, found while wiring the broadcast,
  not speculative.
- `ui/`: scaffolded with `create-next-app` (TypeScript, Tailwind 4, App
  Router, `src/`) + `shadcn@latest init` (Base UI under the hood, not
  Radix — this shadcn generation's own choice, unrelated to this
  project). Own `package.json`/`tsconfig.json`/`eslint.config.mjs` — a
  separate npm project, not a workspace member importing `core/`.
  - `ui/src/lib/types.ts`: hand-mirrors the wire subset of
    `shared/types.ts` the dashboard needs (`make types` codegen was never
    built for either language — see `docs/BACKLOG.md`).
  - `ui/src/lib/use-jarvis.ts`: the one hook everything reads from.
    Backfills `/api/approvals`, `/api/events`, `/api/skills` on mount,
    then layers live `ServerEvent`s on top over a reconnecting WebSocket
    (2s backoff). `decide()` sends `approval.decide` and optimistically
    drops the request from local state rather than waiting on the round
    trip.
  - Components: `Panel`/`CornerBracket` (the Figma reference's visual
    unit), `ApprovalQueue` (list + a shadcn `Dialog` for the full JSON
    payload/diff on expand), `ThoughtStream`, `Transcript`, `Timeline`,
    `SkillHealthPanel`, `StatusBar` (WS connection state + a static
    `CAMERA: IDLE` label — nothing live to show before Phase 8).
  - `ui/src/app/globals.css`: the Figma reference's palette (`#00D4FF`
    cyan / `#FFB84D` amber / `#05080F` deep background), JetBrains Mono
    (`next/font/google`, self-hosted at build time — no runtime fetch to
    Google's CDN), the scanline/corner-bracket/status-pulse look, folded
    into shadcn's own CSS-variable theme rather than replacing it.
  - `ui/eslint.config.mjs`: its own copy of the root
    `no-restricted-imports` executor rule — a separate npm project, no
    inheritance from `eslint.config.js`.
  - `ui/next.config.ts`: pins `turbopack.root` to `ui/` itself — the repo
    root's `package-lock.json` and `ui/`'s own were confusing Turbopack's
    workspace-root guess.
- `core/gate/tests/gate.test.ts`: one new test, `listPendingRequests`
  returns a wire-shaped `ApprovalRequest` with the payload parsed back to
  an object (not the raw JSON string `ApprovalRow` stores).

**DoD — all four measured, live, against the real running `core`
process:**
- **Approve in the browser -> action executes:** PASS. No skill declares
  a yellow-tier capability and calls `ctx.propose()` in a real dispatch
  yet (nothing needs `FS_WRITE`/`SHELL_EXEC` today), so a pending
  approval was injected the same way `gate.test.ts` does it — a second
  `Gate` instance over the same SQLite file the running `core` process
  has open, same self-provisioned Keychain key. Clicking Approve in a
  real headless-Chromium tab produced a real `audit_log` `"approved"`
  entry written by the *running* `core`'s own `Gate` (confirmed by
  querying the DB directly, not by trusting the UI) — see ADR-022 for a
  real mistake this test caught in its own first version.
- **Close the browser mid-approval -> request survives, still pending:**
  PASS. Closed the tab context entirely; the `approvals` row stayed
  `state = 'pending'` in the DB; a fresh tab's `/api/approvals` backfill
  showed it again on reopen.
- **Two tabs stay in sync:** PASS. A third tab, opened before the
  approve click and never interacted with, lost the request from its own
  view at the same moment tab B did — both just WS subscribers of the
  same `core` process, no polling.
- **Grep confirms no executor import path:** PASS —
  `grep -rn executors ui/src` returns nothing; `ui/eslint.config.mjs`
  would also fail the build if one were added.
- Screenshots from each step kept for this session's record (not
  committed — scratch verification output, not a fixture).

**Decided:**
- **One HTTP server carries both REST and the WS upgrade, on one port.**
  No reason for a dashboard client to juggle two ports/origins for one
  logical connection to `core`.
- **`Gate` becomes an `EventEmitter` rather than `core/ws.ts` polling or
  `core/main.ts` calling into `core/ws.ts` directly.** Keeps `Gate`
  ignorant of who's listening (tests, the stdin CLI, and now WS can all
  subscribe or not) and keeps `core/ws.ts` a thin relay with no lifecycle
  logic duplicated from `gate.ts`.
- **The Figma export is a visual reference, not a codebase to adapt.**
  It's Vite + React 19 + Tailwind 4 with no shadcn/ui, no live data, no
  approval queue/timeline/skill-health — reconciling it against the
  actual functional list (ROADMAP.md's own instruction) meant taking the
  palette/typography/panel language and building the real thing fresh
  with `create-next-app`, not forking the mockup.
- **Live DoD verification used Playwright as a plain `ui/` devDependency
  driving real headless Chromium, not the MCP Playwright tool** — checked
  via tool search, unavailable this session. Screenshots + direct SQLite
  assertions stood in for what the MCP tool's snapshot/assertion helpers
  would have given directly.
- **The synthetic approval-injection script asserts through the shared
  SQLite `approvals`/`audit_log` state, not through the injecting `Gate`
  instance's own `propose()` promise.** That promise lives in a
  `pending` map inside the injector's own process — the *running* `core`
  process is the one whose `decide()` actually runs when the browser
  sends `approval.decide`, and it has no way to resolve a different
  process's `Promise`. Caught live (the first version of the script hung
  indefinitely on `await outcomePromise`), not anticipated in advance —
  worth naming because it's the exact cross-process pitfall ADR-021
  already ruled out a standalone `gate/cli.ts` process over.

**Left over — genuinely Phase 8+'s, not this phase's:**
- `ServerEvent`'s `trace` variant (`RouterTrace`, "emitted for every
  router call") stays unwired — needs `core/router/router.ts` itself
  instrumented with a callback, real work `docs/SKILLS.md`/ROADMAP.md's
  Phase 7 DoD doesn't ask for. The `thought` stream (routing traces) is
  live; per-call provider/latency traces are not, yet.
- The camera indicator is a static `CAMERA: IDLE` label — Phase 8 builds
  the actual session lifecycle (`CameraState`, `CameraSession`) this
  would report on live.
- `make types` codegen from `shared/types.ts` — now two hand-kept
  mirrors (Python's, never built either, and `ui/src/lib/types.ts`) —
  logged in `docs/BACKLOG.md`.

**Pre-SOAK audit, 2026-08-04 (same day, before closing):** a full pass
over the docs and repo state before starting SOAK 1 found one real gap —
`make check` never touched `ui/` at all, so a broken dashboard could
reach `main` undetected (contradicts CLAUDE.md § 8: "`main` is always in
a state where `make check` passes"). Fixed: `check` now also runs `ui/`'s
own lint + `next build` (which does its own full TypeScript check once
`.next/types` exists — a separate standalone `tsc --noEmit` step was
tried first and found to fail on a clean checkout / after `rm -rf .next`,
since that types-only include doesn't exist until a build or dev run has
happened once; dropped in favor of just trusting `next build`'s own
check). `make dev` now also starts the dashboard dev server (`cd ui &&
npm run dev`), so daily use during the soak is one command, not two
terminals. Everything else checked — `SPEC.md`, `ROADMAP.md`, `DECISIONS.md`,
`docs/BACKLOG.md`, repo layout, line-length guideline, `.gitignore`
coverage, stray temp files — was already consistent; nothing else changed.

---
