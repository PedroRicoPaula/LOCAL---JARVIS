import assert from "node:assert/strict";
import { test } from "node:test";
import { runRemindersAction } from "../reminders.ts";

function fakeExecFile(stdout: string, shouldFail: Error | null = null) {
  const calls: { file: string; args: readonly string[]; opts?: unknown }[] = [];
  const fn = async (file: string, args: readonly string[], opts?: unknown) => {
    calls.push({ file, args, opts });
    if (shouldFail) throw shouldFail;
    return { stdout, stderr: "" };
  };
  return { fn: fn as unknown as Parameters<typeof runRemindersAction>[1], calls };
}

test("add: passes the task text as a real argv element, never interpolated into the script", async () => {
  const { fn, calls } = fakeExecFile(JSON.stringify({ id: "x-apple-reminder://abc", name: "call the dentist" }));

  const outcome = await runRemindersAction({ action: "add", text: "call the dentist" }, fn);

  assert.deepEqual(outcome, { ok: true, result: { id: "x-apple-reminder://abc", name: "call the dentist" } });
  const call = calls[0]!;
  assert.equal(call.file, "/usr/bin/osascript");
  assert.deepEqual(call.args.slice(-3), ["add", "Tasks", "call the dentist"]);
  // The owner's text is not present anywhere in the fixed script source
  // passed via -e -- only after the "--" separator, as real argv.
  const scriptArg = call.args[call.args.indexOf("-e") + 1]!;
  assert.doesNotMatch(scriptArg, /call the dentist/);
});

test("a malicious-looking task text is still passed through as inert argv data, never executed", async () => {
  const { fn, calls } = fakeExecFile(JSON.stringify({ id: "x", name: "ok" }));
  const dangerous = "'); Application('Terminal').doScript('rm -rf ~'); //";

  await runRemindersAction({ action: "add", text: dangerous }, fn);

  assert.equal(calls[0]?.args.at(-1), dangerous);
});

test("list: parses a real JSON array of open reminders", async () => {
  const { fn } = fakeExecFile(JSON.stringify([{ id: "a", name: "one" }, { id: "b", name: "two" }]));

  const outcome = await runRemindersAction({ action: "list" }, fn);

  assert.deepEqual(outcome, {
    ok: true,
    result: [
      { id: "a", name: "one" },
      { id: "b", name: "two" },
    ],
  });
});

test("complete: passes the exact id, never matches by name inside the script", async () => {
  const { fn, calls } = fakeExecFile(JSON.stringify({ id: "x-apple-reminder://abc", name: "call the dentist" }));

  const outcome = await runRemindersAction({ action: "complete", id: "x-apple-reminder://abc" }, fn);

  assert.equal(outcome.ok, true);
  assert.deepEqual(calls[0]?.args.slice(-3), ["complete", "Tasks", "x-apple-reminder://abc"]);
});

test("a real osascript failure (e.g. a stuck TCC permission dialog timing out) is reported, not thrown", async () => {
  const { fn } = fakeExecFile("", new Error("Error: command timed out"));

  const outcome = await runRemindersAction({ action: "list" }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /timed out/);
});

test("a real execFile failure's stderr is surfaced, not just the useless 'Command failed' message", async () => {
  // Node's own execFile rejection puts the useful part on a separate
  // `.stderr` property, not folded into `.message` -- found live,
  // 2026-08-12: a real failure reported a message with no information
  // in it at all until this was handled.
  const err = Object.assign(new Error("Command failed: /usr/bin/osascript ..."), {
    stderr: "execution error: Not authorized to send Apple events to Reminders. (-1743)\n",
  });
  const { fn } = fakeExecFile("", err);

  const outcome = await runRemindersAction({ action: "list" }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /Not authorized to send Apple events/);
});

test("non-JSON osascript output is reported honestly, not guessed at", async () => {
  const { fn } = fakeExecFile("execution error: something went wrong (-1728)");

  const outcome = await runRemindersAction({ action: "list" }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /unexpected osascript output/);
});

test("a timeout is set on every real call, so a stuck permission dialog can't hang the gate forever", async () => {
  const { fn, calls } = fakeExecFile(JSON.stringify([]));

  await runRemindersAction({ action: "list" }, fn);

  assert.equal((calls[0]?.opts as { timeout?: number } | undefined)?.timeout, 15_000);
});

test("a malformed payload (missing text) is rejected before any real call", async () => {
  const { fn, calls } = fakeExecFile("");

  const outcome = await runRemindersAction({ action: "add" }, fn);

  assert.equal(outcome.ok, false);
  assert.equal(calls.length, 0);
});

test("an unknown action is rejected before any real call", async () => {
  const { fn, calls } = fakeExecFile("");

  const outcome = await runRemindersAction({ action: "delete", id: "x" }, fn);

  assert.equal(outcome.ok, false);
  assert.equal(calls.length, 0);
});
