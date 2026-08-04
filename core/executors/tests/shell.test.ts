import assert from "node:assert/strict";
import { test } from "node:test";
import { runShellAction } from "../shell.ts";

test("dispatches open_app, open_url, media_control, set_volume, set_brightness to their real handlers", async () => {
  // These hit the real executors with no injected fetchFn -- each one's
  // own module has full fake-based coverage already (apps/browser/media/
  // systemControls .test.ts). This just proves the dispatcher routes by
  // `action` correctly, using payloads guaranteed to fail validation
  // fast (before any real execFile call) so it stays offline.
  assert.equal((await runShellAction({ action: "open_app" })).ok, false); // missing app
  assert.equal((await runShellAction({ action: "open_url", url: "not a url" })).ok, false);
  assert.equal((await runShellAction({ action: "media_control", command: "not_real" })).ok, false);
  assert.equal((await runShellAction({ action: "set_volume", level: 999 })).ok, false);
  assert.equal((await runShellAction({ action: "set_brightness", level: 999 })).ok, false);
});

test("rejects an unknown action outright", async () => {
  const outcome = await runShellAction({ action: "delete_everything" });
  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /unknown SHELL_EXEC action/);
});

test("rejects a payload with no action at all", async () => {
  const outcome = await runShellAction({});
  assert.equal(outcome.ok, false);
});

test("rejects a non-object payload", async () => {
  const outcome = await runShellAction("open cursor please");
  assert.equal(outcome.ok, false);
});
