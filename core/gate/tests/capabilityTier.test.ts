import assert from "node:assert/strict";
import { test } from "node:test";
import { capabilityTier } from "../gate.ts";

test("green capabilities run unprompted", () => {
  for (const c of ["MEMORY_READ", "FS_READ", "CAMERA", "NET_READ"] as const) {
    assert.equal(capabilityTier(c), "green", c);
  }
});

test("yellow capabilities require approval", () => {
  for (const c of ["MEMORY_WRITE", "FS_WRITE", "GIT_WRITE", "SHELL_EXEC", "WEBHOOK"] as const) {
    assert.equal(capabilityTier(c), "yellow", c);
  }
});
