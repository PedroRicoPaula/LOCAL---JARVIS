# core/executors/

The only code in this project allowed to cause a real side effect
(SPEC.md: "only executors invoked *by the gate* cause side effects").
`skills/**` cannot import anything here — enforced by `eslint.config.js`'s
`no-restricted-imports` rule, live since Phase 5, before there was
anything real to protect.

An `Executor` (`core/gate/gate.ts`'s own type) takes the payload from an
*already-approved, already-signature-verified* `SignedExecution` and
returns whether the real action succeeded. `Gate.decide()` calls it
directly on approval — a skill never touches an executor, only
`ctx.propose()`. `Gate` holds one `Executor` per `Capability`, so
`SHELL_EXEC` has exactly one registered — `shell.ts`, which dispatches
by `payload.action` to the rest of this directory.

- `shell.ts` — `runShellAction`, the `SHELL_EXEC` dispatcher. Add a new
  action by writing its handler in its own module below, then adding one
  `case` here — never a new capability for a new kind of local action.
- `apps.ts` — `openApp`: `open -a <App> [path]` via `execFile` (never a
  shell), action `open_app`.
- `browser.ts` — `openUrl`: `open <url>` via `execFile`, action
  `open_url`. Only `http`/`https` accepted.
- `media.ts` — `controlMedia`: play/pause/next/previous on Music.app via
  `osascript`, action `media_control`. Every AppleScript string comes
  from a fixed map keyed by a validated enum, never built from raw text.
- `systemControls.ts` — `setVolume` (built-in AppleScript, reliable) and
  `setBrightness` (needs the free `brightness` CLI, `brew install
  brightness` — not pre-installed; reports that plainly if missing
  rather than a silent no-op or an unverified hardware-key-code guess).

All of the above share the same shape: `execFile`, never a shell, args
always passed as an array so nothing in a payload can be interpreted as
a second command — real for every one of them, not just `apps.ts`'s own
comment.

Registered in `core/main.ts`'s `new Gate(db, key, { SHELL_EXEC:
runShellAction, MEMORY_WRITE: createWriteFactExecutor(memory) })`. A
capability with nothing registered just stops at `approved` (unchanged,
safe default).
