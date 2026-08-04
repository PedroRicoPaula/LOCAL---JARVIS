/**
 * core/skills/gate.ts — stub `propose()`. Real implementation is Phase 6
 * (`ApprovalRequest` lifecycle, nonces, HMAC signing, the audit log —
 * CLAUDE.md § 5). No skill built before Phase 6 may declare a
 * side-effecting capability (anything but MEMORY_READ/FS_READ/CAMERA/
 * NET_READ); this stub exists only so `SkillContext.propose` is a real,
 * always-present function per docs/SKILLS.md § 4, and fails loudly if a
 * skill calls it before the gate exists to actually enforce approval.
 */

import type { ApprovalOutcome, ProposedAction } from "../../shared/types.ts";

export async function stubPropose(_action: ProposedAction): Promise<ApprovalOutcome> {
  return {
    ok: false,
    reason: "error",
    detail: "the approval gate does not exist until Phase 6 — see CLAUDE.md § 5",
  };
}
