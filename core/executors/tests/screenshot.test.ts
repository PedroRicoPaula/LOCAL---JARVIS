import assert from "node:assert/strict";
import { test } from "node:test";
import { captureScreenshot } from "../screenshot.ts";

function fakeExecFile(shouldFail = false) {
  const calls: { file: string; args: readonly string[] }[] = [];
  const fn = async (file: string, args: readonly string[]) => {
    calls.push({ file, args });
    if (shouldFail) throw new Error("screencapture: timed out");
    return { stdout: "", stderr: "" };
  };
  return { fn: fn as unknown as Parameters<typeof captureScreenshot>[1], calls };
}

test("real success: calls screencapture -i -c, no file path involved", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await captureScreenshot({ action: "capture_screenshot" }, fn);

  assert.equal(outcome.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.file, "/usr/sbin/screencapture");
  assert.deepEqual(calls[0]?.args, ["-i", "-c"]);
});

test("a real failure (e.g. timeout) is reported, not thrown", async () => {
  const { fn } = fakeExecFile(true);

  const outcome = await captureScreenshot({ action: "capture_screenshot" }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /timed out/);
});

test("a malformed payload is rejected before any real call", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await captureScreenshot({ action: "wrong_action" }, fn);

  assert.equal(outcome.ok, false);
  assert.equal(calls.length, 0);
});
