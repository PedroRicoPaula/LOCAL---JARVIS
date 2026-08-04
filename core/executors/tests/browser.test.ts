import assert from "node:assert/strict";
import { test } from "node:test";
import { openUrl } from "../browser.ts";

function fakeExecFile() {
  const calls: { file: string; args: readonly string[] }[] = [];
  const fn = async (file: string, args: readonly string[]) => {
    calls.push({ file, args });
    return { stdout: "", stderr: "" };
  };
  return { fn: fn as unknown as Parameters<typeof openUrl>[1], calls };
}

test("opens a real http(s) URL", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await openUrl({ action: "open_url", url: "https://github.com" }, fn);

  assert.deepEqual(outcome, { ok: true, result: { url: "https://github.com/" } });
  assert.deepEqual(calls, [{ file: "open", args: ["https://github.com/"] }]);
});

test("rejects a non-http(s) scheme -- no javascript:/file: surface", async () => {
  const { fn } = fakeExecFile();

  const outcome = await openUrl({ action: "open_url", url: "javascript:alert(1)" }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /unsupported URL scheme/);
});

test("rejects an invalid URL string, doesn't throw", async () => {
  const { fn } = fakeExecFile();

  const outcome = await openUrl({ action: "open_url", url: "not a url" }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /not a valid URL/);
});

test("rejects a malformed payload", async () => {
  const outcome = await openUrl({ action: "open_url" });
  assert.equal(outcome.ok, false);
});
