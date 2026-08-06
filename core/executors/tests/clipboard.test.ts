import assert from "node:assert/strict";
import { test } from "node:test";
import { readClipboard, writeClipboard } from "../clipboard.ts";

function fakeExecFile(stdout = "", shouldFail = false) {
  const calls: { file: string; args: readonly string[] }[] = [];
  const fn = async (file: string, args: readonly string[]) => {
    calls.push({ file, args });
    if (shouldFail) throw new Error("pbpaste: command not found");
    return { stdout, stderr: "" };
  };
  return { fn: fn as unknown as Parameters<typeof readClipboard>[1], calls };
}

test("readClipboard: real content comes back verbatim", async () => {
  const { fn, calls } = fakeExecFile("hello world");

  const outcome = await readClipboard({ action: "read_clipboard" }, fn);

  assert.deepEqual(outcome, { ok: true, result: { text: "hello world" } });
  assert.deepEqual(calls, [{ file: "pbpaste", args: [] }]);
});

test("readClipboard: an empty clipboard is still ok, empty text", async () => {
  const { fn } = fakeExecFile("");

  const outcome = await readClipboard({ action: "read_clipboard" }, fn);

  assert.deepEqual(outcome, { ok: true, result: { text: "" } });
});

test("readClipboard: a real pbpaste failure is reported, not thrown", async () => {
  const { fn } = fakeExecFile("", true);

  const outcome = await readClipboard({ action: "read_clipboard" }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /command not found/);
});

test("readClipboard: a malformed payload is rejected before any real call", async () => {
  const { fn, calls } = fakeExecFile();

  const outcome = await readClipboard({ action: "wrong_action" }, fn);

  assert.equal(outcome.ok, false);
  assert.equal(calls.length, 0);
});

function fakeWriteClipboard(shouldFail = false) {
  const calls: string[] = [];
  const fn = async (text: string) => {
    calls.push(text);
    if (shouldFail) throw new Error("pbcopy exited with code 1");
  };
  return { fn, calls };
}

test("writeClipboard: real text is passed through verbatim", async () => {
  const { fn, calls } = fakeWriteClipboard();

  const outcome = await writeClipboard({ action: "write_clipboard", text: "buy milk" }, fn);

  assert.deepEqual(outcome, { ok: true, result: { text: "buy milk" } });
  assert.deepEqual(calls, ["buy milk"]);
});

test("writeClipboard: a real pbcopy failure is reported, not thrown", async () => {
  const { fn } = fakeWriteClipboard(true);

  const outcome = await writeClipboard({ action: "write_clipboard", text: "buy milk" }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /pbcopy exited/);
});

test("writeClipboard: empty text is rejected before any real call", async () => {
  const { fn, calls } = fakeWriteClipboard();

  const outcome = await writeClipboard({ action: "write_clipboard", text: "" }, fn);

  assert.equal(outcome.ok, false);
  assert.equal(calls.length, 0);
});

test("writeClipboard: a malformed payload is rejected before any real call", async () => {
  const { fn, calls } = fakeWriteClipboard();

  const outcome = await writeClipboard({ action: "wrong_action" }, fn);

  assert.equal(outcome.ok, false);
  assert.equal(calls.length, 0);
});
