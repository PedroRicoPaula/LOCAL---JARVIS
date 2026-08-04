/**
 * core/skills/gate.ts — fallback `propose()` for when `context.ts` isn't
 * given a real `core/gate/gate.ts` `Gate` instance (tests, or any caller
 * that hasn't wired one up). The real implementation is Phase 6's `Gate`
 * (`ApprovalRequest` lifecycle, nonces, HMAC signing, the audit log —
 * CLAUDE.md § 5); this stub exists only so `SkillContext.propose` is
 * always a real, present function per docs/SKILLS.md § 4, and fails
 * loudly rather than silently no-opping if something calls it without a
 * gate behind it.
 */

import type { ApprovalOutcome, ProposedAction } from "../../shared/types.ts";

export async function stubPropose(_action: ProposedAction): Promise<ApprovalOutcome> {
  return {
    ok: false,
    reason: "error",
    detail: "no Gate was wired into this SkillContext — see core/skills/context.ts's `gate` option",
  };
}
