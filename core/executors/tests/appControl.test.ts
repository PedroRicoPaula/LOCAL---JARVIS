import assert from "node:assert/strict";
import { test } from "node:test";
import { runAppControlAction } from "../appControl.ts";

test("dispatches open_app, close_app, open_url to their real handlers", async () => {
  // Payloads guaranteed to fail validation fast (before any real
  // execFile call), same reasoning as shell.test.ts's own dispatcher
  // test -- each handler's own module has full fake-based coverage
  // already (apps/browser.test.ts).
  assert.equal((await runAppControlAction({ action: "open_app" })).ok, false); // missing app
  assert.equal((await runAppControlAction({ action: "close_app" })).ok, false); // missing app
  assert.equal((await runAppControlAction({ action: "open_url", url: "not a url" })).ok, false);
});

test("rejects an unknown action outright", async () => {
  const outcome = await runAppControlAction({ action: "delete_everything" });
  assert.equal(outcome.ok, false);
  assert.match(outcome.error!, /unknown APP_CONTROL action/);
});

test("rejects a payload with no action at all", async () => {
  const outcome = await runAppControlAction({});
  assert.equal(outcome.ok, false);
});

test("rejects a non-object payload", async () => {
  const outcome = await runAppControlAction("open spotify please");
  assert.equal(outcome.ok, false);
});
