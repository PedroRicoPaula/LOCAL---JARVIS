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
`ctx.propose()`.

- `apps.ts` — `openApp`: `open -a <App> [path]` via `execFile` (never a
  shell), for `SHELL_EXEC` proposals shaped `{action: "open_app", app,
  path?}`. `open` is a narrow macOS launcher, not an interpreter — no
  injection surface regardless of what `app`/`path` contain.

Registered in `core/main.ts`'s `new Gate(db, key, { SHELL_EXEC: openApp })`.
Add a new executor by writing the module here, exporting a function
matching `Executor`'s signature, and adding it to that map — a capability
with nothing registered just stops at `approved` (unchanged, safe
default), same as before this file had any real content.
