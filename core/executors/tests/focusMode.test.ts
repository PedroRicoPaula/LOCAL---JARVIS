import assert from "node:assert/strict";
import { test } from "node:test";
import { setFocusMode } from "../focusMode.ts";

function fakeExecFile(shouldFail = false) {
  const calls: { file: string; args: readonly string[] }[] = [];
  const fn = async (file: string, args: readonly string[]) => {
    calls.push({ file, args });
    if (shouldFail) throw new Error("Error: couldn't find the shortcut");
    return { stdout: "", stderr: "" };
  };
  return { fn: fn as unknown as Parameters<typeof setFocusMode>[1], calls };
}

test("enabled true runs the configured 'on' shortcut", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await setFocusMode({ action: "set_focus_mode", enabled: true }, fn);

  assert.deepEqual(outcome, { ok: true, result: { enabled: true } });
  assert.equal(calls[0]?.file, "shortcuts");
  assert.deepEqual(calls[0]?.args, ["run", "JARVIS Focus On"]);
});

test("enabled false runs the configured 'off' shortcut", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await setFocusMode({ action: "set_focus_mode", enabled: false }, fn);

  assert.deepEqual(outcome, { ok: true, result: { enabled: false } });
  assert.deepEqual(calls[0]?.args, ["run", "JARVIS Focus Off"]);
});

test("a missing shortcut (owner hasn't set it up yet) is reported, not thrown", async () => {
  const { fn } = fakeExecFile(true);

  const outcome = await setFocusMode({ action: "set_focus_mode", enabled: true }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /couldn't find the shortcut/);
});

test("a malformed payload is rejected before any real call", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await setFocusMode({ action: "wrong_action" }, fn);

  assert.equal(outcome.ok, false);
  assert.equal(calls.length, 0);
});

test("a missing 'enabled' field is rejected before any real call", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await setFocusMode({ action: "set_focus_mode" }, fn);

  assert.equal(outcome.ok, false);
  assert.equal(calls.length, 0);
});
