import assert from "node:assert/strict";
import { test } from "node:test";
import { setBrightness, setVolume } from "../systemControls.ts";

function fakeExecFile(shouldFail: false | Error = false) {
  const calls: { file: string; args: readonly string[] }[] = [];
  const fn = async (file: string, args: readonly string[]) => {
    calls.push({ file, args });
    if (shouldFail) throw shouldFail;
    return { stdout: "", stderr: "" };
  };
  return { fn: fn as unknown as Parameters<typeof setVolume>[1], calls };
}

test("setVolume runs the real AppleScript volume command", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await setVolume({ action: "set_volume", level: 42 }, fn);

  assert.deepEqual(outcome, { ok: true, result: { level: 42 } });
  assert.deepEqual(calls, [{ file: "osascript", args: ["-e", "set volume output volume 42"] }]);
});

test("setVolume rejects an out-of-range level", async () => {
  const outcome = await setVolume({ action: "set_volume", level: 150 });
  assert.equal(outcome.ok, false);
});

test("setBrightness calls the brightness CLI with a 0-1 scaled value", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await setBrightness({ action: "set_brightness", level: 50 }, fn);

  assert.deepEqual(outcome, { ok: true, result: { level: 50 } });
  assert.deepEqual(calls, [{ file: "brightness", args: ["0.50"] }]);
});

test("setBrightness reports a missing CLI plainly, not a silent no-op", async () => {
  const enoent = Object.assign(new Error("spawn brightness ENOENT"), { code: "ENOENT" });
  const { fn } = fakeExecFile(enoent);

  const outcome = await setBrightness({ action: "set_brightness", level: 50 }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /brew install brightness/);
});
