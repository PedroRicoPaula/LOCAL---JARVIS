# core/executors/

Empty until Phase 6 (the gate — `ApprovalRequest` lifecycle, nonces, HMAC
signing, the audit log; CLAUDE.md § 5). This directory exists now, ahead of
that phase, purely to establish the import path `eslint.config.js`'s
`no-restricted-imports` rule blocks `skills/**` from reaching — so the
guardrail ("a skill cannot import an executor," CLAUDE.md § 5b) is live
from Phase 5 rather than retrofitted once there's something real here to
protect.

Nothing in this directory yet performs a side effect. When Phase 6 adds
that, it lives here.
