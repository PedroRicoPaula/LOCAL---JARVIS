/**
 * core/skills/camera.ts — stub `CameraHandle` (shared/types.ts). Real
 * implementation is Phase 8 (`senses/eyes`, the ARMED/CAPTURE state
 * machine, SPEC.md § 6). No skill built before Phase 8 may declare the
 * CAMERA capability; this stub exists only so `SkillContext.camera` is a
 * real, always-present field per docs/SKILLS.md § 4, and fails loudly
 * (not silently) if something tries to use it early.
 */

import type { CameraHandle } from "../../shared/types.ts";

export function createStubCameraHandle(): CameraHandle {
  return {
    state: "idle",
    async open(): Promise<never> {
      throw new Error("camera is not available until Phase 8 (senses/eyes) — see SPEC.md § 6");
    },
  };
}
