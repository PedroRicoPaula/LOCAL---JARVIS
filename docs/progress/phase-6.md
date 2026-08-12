# Phase 6 — built, 2026-08-04

**Built:**
- `core/gate/db.ts`: `approvals` + `audit_log` schema on the same
  database file `core/memory/db.ts` already opens (not a separate file —
  same pattern `core/skills/store.ts` uses for skill-owned tables).
  `audit_log` is append-only via the same `RAISE(ABORT)` trigger pattern
  Phase 4 used for `events` — CLAUDE.md § 5: "The audit log is
  append-only. Rejections are logged too."
- `core/gate/hmac.ts`: HMAC-SHA256 over `{id, nonce, payload}`.
  `sign()`/`verify()` take the key as a plain argument — pure,
  synchronous, directly unit-tested. `getSigningKey()` is the only impure
  piece: self-provisions a random 32-byte key into Keychain
  (`jarvis-gate-hmac-key`, distinct from `jarvis-nim-key`) the first time
  it ever runs on a machine — nothing external issues this one, unlike an
  owner-supplied API key. Signature comparison is timing-safe (a manual
  constant-time XOR loop, not `===`) — a real if narrow side channel
  otherwise, for something whose whole job is proving possession of the
  key.
- `core/gate/gate.ts`: the `ApprovalRequest` lifecycle (SPEC.md § 8),
  server-authoritative. `propose()` checks the capability's tier
  (`GREEN_CAPABILITIES`, already defined in `shared/types.ts` since
  Phase 3) — green runs unprompted and logs `green_auto_run`; yellow
  creates a `pending` row, logs `created`, and returns a `Promise` that
  only resolves via `decide()` or its own expiry timer (default 5 min,
  `DEFAULT_EXPIRY_MS`). `decide()` fails closed — logged as `rejected`
  with `reason: "replay"` — for anything not currently `pending`: an
  already-decided nonce, a wrong nonce against the right id, or an
  unknown id, all lumped into the same "don't honor it" bucket. A
  decision arriving after `expiresAt` (simulated via an injectable `now`)
  is treated as expired even if the real timer hasn't fired yet.
  `markExecuted()` completes the `approved -> executed` leg for a future
  executor (Phase 12+) to call — not exercised by any real caller yet
  (`core/executors/` is still just Phase 5's README stub), built now so
  the lifecycle SPEC.md § 8 describes is whole and tested, not half-done.
- `core/skills/context.ts`: `buildSkillContext` now takes an optional
  `gate: Gate` — when given, `ctx.propose` is bound to that skill's id
  and routed through the real lifecycle; omitted (every existing test,
  and any future caller that hasn't wired one) falls back to
  `stubPropose`'s honest refusal, never a silent no-op.
- `core/gate/cli.ts` + `core/main.ts`: `watchApprovalCommands()` reads
  `list` / `approve <id>` / `reject <id>` from the same terminal
  `make dev` runs in, concurrently with the ears/voice loop. Not a
  separate CLI *process* — `Gate`'s pending approvals are `Promise`
  resolvers living in `core`'s own memory (the `pending` map in
  `gate.ts`), so only something running inside that same process can
  resolve one. `shared/types.ts`'s `approval.decide` client event exists
  for exactly this over a WebSocket once Phase 7 builds a dashboard; this
  is the no-new-infrastructure equivalent until then.
- 20 new tests (156 total across both languages): `hmac.test.ts` (sign/
  verify round-trip, tampered payload/nonce, wrong key, determinism),
  `gate.test.ts` (12 cases covering the full lifecycle including replay
  and clock-skew expiry), `capabilityTier.test.ts`, `context.test.ts`
  (the real-gate-vs-stub wiring).

**DoD — all measured, most live:**
- **A proposed action blocks until answered:** PASS — unit-tested
  (doesn't resolve before a decision) and confirmed live against a real
  Keychain-backed `Gate`.
- **Replaying a spent nonce fails and logs `reason: replay`:** PASS,
  live — confirmed against a real audit log: `rejected
  {"reason":"replay"}` after re-deciding an already-approved request.
- **An expired approval cannot be executed:** PASS — the real timer path
  (short `expiresInMs`, waited for real) and the clock-skew path
  (injected `now()`, no real wait) both tested.
- **A green-tier action runs unprompted and is still logged:** PASS,
  live — `green_auto_run {"capability":"MEMORY_READ","skillId":"brief",...}`
  in the real audit log, resolved with no blocking at all.
- **`brief` still works unchanged:** PASS — its own 5 tests rerun
  unmodified after wiring the real gate into `context.ts`, all still
  green (`brief` is `MEMORY_READ`-only and never calls `ctx.propose`, so
  this was expected to hold, and does).

**Decided:**
- **Gate tables live in the same database file as `core/memory/db.ts`'s
  schema, not a separate one.** One `DatabaseSync` handle for the whole
  process, same reasoning `core/skills/store.ts` already established for
  skill-owned tables — no benefit to a second file, real cost in having
  to open, migrate, and reason about two.
- **`sign()`/`verify()` are pure and take the key as an argument;
  `getSigningKey()` (the Keychain I/O) is not unit-tested.** Same
  precedent as `core/router/keychain.ts`, which has never had a test file
  — real system dependencies are proven live, not mocked; what's actually
  security-critical (the signing math) is what gets the thorough test
  coverage.
- **No standalone `core/gate/cli.ts` *process* — approval commands are
  read from stdin inside the same `core` process instead.** Found while
  designing it: `Gate`'s pending approvals resolve via in-memory
  `Promise`s, not database rows a separate process could poll and
  "resolve" — a raw `UPDATE approvals SET state = 'approved'` from
  outside wouldn't call anything, the skill's `await ctx.propose()` would
  hang forever. Reconsidered before writing the broken version, not
  after.
- **`markExecuted()` is built and tested even though nothing calls it
  yet.** `core/executors/` remains empty until Phase 12+; building the
  full state machine now, rather than stopping at `approved`, means the
  lifecycle SPEC.md § 8 actually describes is complete today and an
  executor just has to call one already-tested method later, not design
  new gate behavior itself.

**Left over — genuinely Phase 7's, not this phase's:**
- The dashboard's live approval queue (`ServerEvent`'s `approval.new`/
  `approval.resolved`, `ClientEvent`'s `approval.decide` — already typed
  in `shared/types.ts`) still needs a real WebSocket server in `core` and
  the Next.js client. `core/gate/cli.ts`'s stdin reader is the honest
  stand-in until then, same relationship `senses/voice`'s `say` backend
  has to a future Piper voice, or `conversation/cli.ts` has to real voice
  IPC before Phase 5's integration work.
  **Resolved in Phase 7** — see its log below.

---
