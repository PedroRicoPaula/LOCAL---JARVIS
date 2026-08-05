import assert from "node:assert/strict";
import { test } from "node:test";
import { controlMedia } from "../media.ts";

function fakeExecFile() {
  const calls: { file: string; args: readonly string[] }[] = [];
  const fn = async (file: string, args: readonly string[]) => {
    calls.push({ file, args });
    return { stdout: "", stderr: "" };
  };
  return { fn: fn as unknown as Parameters<typeof controlMedia>[1], calls };
}

test("play/pause/next/previous each run a fixed, hardcoded AppleScript against Music", async () => {
  for (const command of ["play", "pause", "next", "previous"] as const) {
    const { fn, calls } = fakeExecFile();
    const outcome = await controlMedia({ action: "media_control", app: "Music", command }, fn);
    assert.deepEqual(outcome, { ok: true, result: { app: "Music", command } });
    assert.equal(calls[0]?.file, "osascript");
    assert.equal(calls[0]?.args[0], "-e");
    assert.match(calls[0]?.args[1] ?? "", /tell application "Music"/);
  }
});

test("the same commands target Spotify when the payload says so", async () => {
  for (const command of ["play", "pause", "next", "previous"] as const) {
    const { fn, calls } = fakeExecFile();
    const outcome = await controlMedia({ action: "media_control", app: "Spotify", command }, fn);
    assert.deepEqual(outcome, { ok: true, result: { app: "Spotify", command } });
    assert.match(calls[0]?.args[1] ?? "", /tell application "Spotify"/);
  }
});

test("rejects an unknown command -- no silent fallback to some other action", async () => {
  const { fn } = fakeExecFile();
  const outcome = await controlMedia({ action: "media_control", app: "Music", command: "shuffle_everything" }, fn);
  assert.equal(outcome.ok, false);
});

test("rejects an unknown app -- no silent fallback to Music or Spotify", async () => {
  const { fn } = fakeExecFile();
  const outcome = await controlMedia({ action: "media_control", app: "VLC", command: "play" }, fn);
  assert.equal(outcome.ok, false);
});

test("a real osascript failure (app not running) is reported, not thrown", async () => {
  const fn = (async () => {
    throw new Error("Music got an error: Application isn't running.");
  }) as unknown as Parameters<typeof controlMedia>[1];

  const outcome = await controlMedia({ action: "media_control", app: "Music", command: "play" }, fn);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /isn't running/);
});
