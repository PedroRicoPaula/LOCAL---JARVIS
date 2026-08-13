import assert from "node:assert/strict";
import { test } from "node:test";
import { createStubCameraHandle, restrictPointerControl } from "../camera.ts";
import type { CameraHandle, CameraSession, CameraState } from "../../../shared/types.ts";

function fakeRealHandle(): CameraHandle & { pointerCalls: string[]; setState(s: CameraState): void } {
  const pointerCalls: string[] = [];
  let currentState: CameraState = "armed";
  return {
    pointerCalls,
    get state() {
      return currentState;
    },
    setState(s: CameraState) {
      currentState = s;
    },
    async open(): Promise<CameraSession> {
      return {
        id: "s1",
        openedAt: 0,
        expiresAt: 0,
        idleUntil: 0,
        reason: "test",
        async capture() {
          return { path: "/x.jpg", capturedAt: 0, sessionId: "s1", retained: false };
        },
        async close() {},
        startGestures() {
          pointerCalls.push("gestures-start");
        },
        stopGestures() {
          pointerCalls.push("gestures-stop");
        },
        startPointerControl() {
          pointerCalls.push("pointer-start");
        },
        stopPointerControl() {
          pointerCalls.push("pointer-stop");
        },
      };
    },
  };
}

test("createStubCameraHandle throws honestly on open(), never returns a usable session", async () => {
  const handle = createStubCameraHandle();

  assert.equal(handle.state, "idle");
  await assert.rejects(() => handle.open("test"), /CAMERA/);
});

test("restrictPointerControl: capture/close/gestures still reach the real handle unchanged", async () => {
  const real = fakeRealHandle();
  const restricted = restrictPointerControl(real);

  const session = await restricted.open("test");
  await session.capture();
  session.startGestures();
  session.stopGestures();
  await session.close();

  assert.deepEqual(real.pointerCalls, ["gestures-start", "gestures-stop"]);
});

test("restrictPointerControl: startPointerControl throws instead of reaching the real handle", async () => {
  const real = fakeRealHandle();
  const restricted = restrictPointerControl(real);
  const session = await restricted.open("test");

  assert.throws(() => session.startPointerControl(), /POINTER_CONTROL/);
  assert.deepEqual(real.pointerCalls, [], "the real handle must never see the call");
});

test("restrictPointerControl: stopPointerControl throws instead of reaching the real handle", async () => {
  const real = fakeRealHandle();
  const restricted = restrictPointerControl(real);
  const session = await restricted.open("test");

  assert.throws(() => session.stopPointerControl(), /POINTER_CONTROL/);
  assert.deepEqual(real.pointerCalls, []);
});

test("restrictPointerControl: state passes through live from the real handle, not snapshotted", async () => {
  const real = fakeRealHandle();
  const restricted = restrictPointerControl(real);

  assert.equal(restricted.state, "armed");
  real.setState("idle");
  assert.equal(restricted.state, "idle", "must read through, not cache the value at wrap time");
});
