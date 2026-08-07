import assert from "node:assert/strict";
import { test } from "node:test";
import { closeApp, openApp } from "../apps.ts";

function fakeExecFile(shouldFail = false) {
  const calls: { file: string; args: readonly string[] }[] = [];
  const fn = async (file: string, args: readonly string[]) => {
    calls.push({ file, args });
    if (shouldFail) throw new Error("open: application not found");
    return { stdout: "", stderr: "" };
  };
  return { fn: fn as unknown as Parameters<typeof openApp>[1], calls };
}

test("opens an app by name, no path", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await openApp({ action: "open_app", app: "Cursor" }, fn);

  assert.deepEqual(outcome, { ok: true, result: { app: "Cursor", path: null } });
  assert.deepEqual(calls, [{ file: "open", args: ["-a", "Cursor"] }]);
});

test("opens an app with a path (e.g. a project directory)", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await openApp({ action: "open_app", app: "Cursor", path: "/Users/pedro/dev/jarvis" }, fn);

  assert.deepEqual(outcome, { ok: true, result: { app: "Cursor", path: "/Users/pedro/dev/jarvis" } });
  assert.deepEqual(calls, [{ file: "open", args: ["-a", "Cursor", "/Users/pedro/dev/jarvis"] }]);
});

test("a real launch failure (app not found) reports the error, doesn't throw", async () => {
  const { fn } = fakeExecFile(true);

  const outcome = await openApp({ action: "open_app", app: "Nonexistent" }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /application not found/);
});

test("rejects an open_app payload missing app", async () => {
  const outcome = await openApp({ action: "open_app" });
  assert.equal(outcome.ok, false);
});

test("rejects a payload with an unknown action -- no silent fallback to opening something", async () => {
  const outcome = await openApp({ action: "delete_everything", app: "Cursor" });
  assert.equal(outcome.ok, false);
});

test("rejects a non-object open_app payload", async () => {
  const outcome = await openApp("just open cursor please");
  assert.equal(outcome.ok, false);
});

// --- closeApp ---------------------------------------------------------

test("closes an app by name via a graceful AppleScript quit", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await closeApp({ action: "close_app", app: "Spotify" }, fn);

  assert.deepEqual(outcome, { ok: true, result: { app: "Spotify" } });
  assert.deepEqual(calls, [{ file: "osascript", args: ["-e", 'tell application "Spotify" to quit'] }]);
});

test("a real quit failure (app not running) reports the error, doesn't throw", async () => {
  const { fn } = fakeExecFile(true);

  const outcome = await closeApp({ action: "close_app", app: "Spotify" }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /application not found/);
});

test("rejects a close_app payload missing app", async () => {
  const outcome = await closeApp({ action: "close_app" });
  assert.equal(outcome.ok, false);
});

test("rejects an app name containing a quote -- can't safely embed it in the AppleScript string", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await closeApp({ action: "close_app", app: 'Evil" to quit\ntell application "Finder' }, fn);

  assert.equal(outcome.ok, false);
  assert.deepEqual(calls, [], "never even attempted the call");
});

test("rejects a non-object close_app payload", async () => {
  const outcome = await closeApp("just close spotify please");
  assert.equal(outcome.ok, false);
});
