import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { ProposedAction } from "../../../shared/types.ts";
import type { Executor } from "../gate.ts";
import { Gate } from "../gate.ts";

const KEY = "test-signing-key";

function freshGate(): Gate {
  return new Gate(new DatabaseSync(":memory:"), KEY);
}

function freshGateWithExecutor(executor: Executor): Gate {
  return new Gate(new DatabaseSync(":memory:"), KEY, { SHELL_EXEC: executor });
}

function auditRows(gate: Gate): { event: string; detail: unknown }[] {
  // Reach into the private db via the public getApproval/listPending path
  // isn't enough for audit rows -- test via a small helper query instead.
  const db = (gate as unknown as { db: DatabaseSync }).db;
  return (db.prepare("SELECT event, detail FROM audit_log ORDER BY ts").all() as { event: string; detail: string }[]).map(
    (r) => ({ event: r.event, detail: JSON.parse(r.detail) }),
  );
}

test("a green-tier action runs unprompted and is still logged", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "MEMORY_READ", humanSummary: "read something", payload: { x: 1 } };

  const outcome = await gate.propose(action, "brief");

  assert.deepEqual(outcome, { ok: true, result: { x: 1 } });
  const audit = auditRows(gate);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.event, "green_auto_run");
});

test("a green-tier action with a registered executor actually calls it -- the real bug this fixes", async () => {
  const calls: unknown[] = [];
  const gate = new Gate(new DatabaseSync(":memory:"), KEY, {
    CAMERA: async (payload) => {
      calls.push(payload);
      return { ok: true, result: { opened: true } };
    },
  });
  const action: ProposedAction = { capability: "CAMERA", humanSummary: "do the thing", payload: { x: 1 } };

  const outcome = await gate.propose(action, "some-skill");

  assert.deepEqual(calls, [{ x: 1 }]);
  assert.deepEqual(outcome, { ok: true, result: { opened: true } });
  const audit = auditRows(gate);
  assert.deepEqual(
    audit.map((a) => a.event),
    ["green_auto_run", "executed"],
  );
});

test("a green-tier action whose executor fails reports the failure honestly", async () => {
  const gate = new Gate(new DatabaseSync(":memory:"), KEY, {
    CAMERA: async () => ({ ok: false, error: "camera permission denied" }),
  });
  const action: ProposedAction = { capability: "CAMERA", humanSummary: "do the thing", payload: { x: 1 } };

  const outcome = await gate.propose(action, "some-skill");

  assert.deepEqual(outcome, { ok: false, reason: "error", detail: "camera permission denied" });
  const audit = auditRows(gate);
  assert.deepEqual(
    audit.map((a) => a.event),
    ["green_auto_run", "execution_failed"],
  );
});

test("a green-tier action whose executor throws is treated as a failure, not an unhandled rejection", async () => {
  const gate = new Gate(new DatabaseSync(":memory:"), KEY, {
    CAMERA: async () => {
      throw new Error("boom");
    },
  });
  const action: ProposedAction = { capability: "CAMERA", humanSummary: "do the thing", payload: { x: 1 } };

  const outcome = await gate.propose(action, "some-skill");

  assert.deepEqual(outcome, { ok: false, reason: "error", detail: "boom" });
});

test("a yellow-tier action blocks until answered", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "MEMORY_WRITE", humanSummary: "write something", payload: { x: 1 } };

  let resolved = false;
  const outcomePromise = gate.propose(action, "some-skill").then((o) => {
    resolved = true;
    return o;
  });

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(resolved, false, "must not resolve before a decision or expiry");

  const pending = gate.listPending();
  assert.equal(pending.length, 1);
  gate.decide({ requestId: pending[0]!.id, nonce: pending[0]!.nonce, decision: "approve", decidedAt: Date.now() });

  const outcome = await outcomePromise;
  assert.equal(outcome.ok, true);
});

test("approval yields a signed execution the caller can hand to an executor later", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "FS_WRITE", humanSummary: "write a file", payload: { path: "/tmp/x" } };

  const outcomePromise = gate.propose(action, "some-skill");
  const [request] = gate.listPending();
  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now() });
  const outcome = await outcomePromise;

  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    const signed = outcome.result as { requestId: string; nonce: string; signature: string };
    assert.equal(signed.requestId, request!.id);
    assert.equal(signed.nonce, request!.nonce);
    assert.ok(signed.signature.length > 0);
  }
});

test("rejecting resolves ok:false with reason rejected, and is logged", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "SHELL_EXEC", humanSummary: "run a command", payload: {} };

  const outcomePromise = gate.propose(action, "some-skill");
  const [request] = gate.listPending();
  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "reject", decidedAt: Date.now() });
  const outcome = await outcomePromise;

  assert.deepEqual(outcome, { ok: false, reason: "rejected" });
  const audit = auditRows(gate);
  assert.ok(audit.some((a) => a.event === "rejected"));
});

test("replaying a spent nonce fails and logs reason: replay -- SPEC.md SS8, verbatim", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "GIT_WRITE", humanSummary: "push a commit", payload: {} };

  const outcomePromise = gate.propose(action, "some-skill");
  const [request] = gate.listPending();
  const response = { requestId: request!.id, nonce: request!.nonce, decision: "approve" as const, decidedAt: Date.now() };

  gate.decide(response); // first decision: consumes the nonce
  await outcomePromise;

  gate.decide(response); // replay: same nonce, already decided

  const audit = auditRows(gate);
  const replayEntries = audit.filter((a) => a.event === "rejected" && (a.detail as { reason?: string }).reason === "replay");
  assert.equal(replayEntries.length, 1);
});

test("a decision with the right id but a wrong nonce is treated as replay, not honored", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "WEBHOOK", humanSummary: "call a webhook", payload: {} };

  const outcomePromise = gate.propose(action, "some-skill");
  const [request] = gate.listPending();

  gate.decide({ requestId: request!.id, nonce: "not-the-real-nonce", decision: "approve", decidedAt: Date.now() });

  // Still pending -- the bogus decision must not have consumed it.
  assert.equal(gate.listPending().length, 1);
  const audit = auditRows(gate);
  assert.ok(audit.some((a) => a.event === "rejected" && (a.detail as { reason?: string }).reason === "replay"));

  // The real decision still works afterward.
  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now() });
  const outcome = await outcomePromise;
  assert.equal(outcome.ok, true);
});

test("an expired approval cannot be executed -- times out on its own and resolves expired", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "FS_WRITE", humanSummary: "write", payload: {}, expiresInMs: 10 };

  const outcome = await gate.propose(action, "some-skill");

  assert.deepEqual(outcome, { ok: false, reason: "expired" });
  const audit = auditRows(gate);
  assert.ok(audit.some((a) => a.event === "expired"));
});

test("a decision arriving after expiry (clock skew) is rejected as expired, not honored", async () => {
  const gate = freshGate();
  const action: ProposedAction = {
    capability: "SHELL_EXEC",
    humanSummary: "run",
    payload: {},
    expiresInMs: 60_000, // long enough the real timer won't fire during this test
  };

  const outcomePromise = gate.propose(action, "some-skill");
  const [request] = gate.listPending();

  // Simulate a decide() call that arrives after expiresAt, without
  // actually waiting for the real timer.
  gate.decide(
    { requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now() },
    () => Date.now() + 61_000,
  );

  const outcome = await outcomePromise;
  assert.deepEqual(outcome, { ok: false, reason: "expired" });
});

test("markExecuted only succeeds on an approved request, and logs it", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "FS_WRITE", humanSummary: "write", payload: {} };

  const outcomePromise = gate.propose(action, "some-skill");
  const [request] = gate.listPending();
  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now() });
  await outcomePromise;

  assert.equal(gate.markExecuted(request!.id), true);
  const audit = auditRows(gate);
  assert.ok(audit.some((a) => a.event === "executed"));

  // Calling it again (already executed, not approved anymore) must fail.
  assert.equal(gate.markExecuted(request!.id), false);
});

test("markExecuted refuses a request that was never approved", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "FS_WRITE", humanSummary: "write", payload: {} };
  const outcomePromise = gate.propose(action, "some-skill");
  const [request] = gate.listPending();
  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "reject", decidedAt: Date.now() });
  await outcomePromise;

  assert.equal(gate.markExecuted(request!.id), false);
});

test("audit_log is genuinely append-only", () => {
  const gate = freshGate();
  const db = (gate as unknown as { db: DatabaseSync }).db;
  db.prepare("INSERT INTO audit_log (id, ts, approval_id, event, detail) VALUES (?, ?, ?, ?, ?)").run(
    "a1",
    1,
    null,
    "created",
    "{}",
  );

  assert.throws(() => db.prepare("UPDATE audit_log SET event = 'x' WHERE id = 'a1'").run(), /append-only/);
  assert.throws(() => db.prepare("DELETE FROM audit_log WHERE id = 'a1'").run(), /append-only/);
});

test("listPending only returns pending approvals, not decided ones", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "FS_WRITE", humanSummary: "write", payload: {} };
  const outcomePromise = gate.propose(action, "some-skill");
  const [request] = gate.listPending();
  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now() });
  await outcomePromise;

  assert.deepEqual(gate.listPending(), []);
});

test("listPendingRequests returns wire-shaped ApprovalRequest, payload parsed back to an object", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "FS_WRITE", humanSummary: "write the file", payload: { path: "a.txt" } };
  const outcomePromise = gate.propose(action, "some-skill");

  const [request] = gate.listPendingRequests();

  assert.equal(request!.humanSummary, "write the file");
  assert.equal(request!.skillId, "some-skill");
  assert.equal(request!.state, "pending");
  assert.deepEqual(request!.payload, { path: "a.txt" });

  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now() });
  await outcomePromise;
});

test("approving a capability with a registered executor calls it and settles executed", async () => {
  let received: unknown;
  const gate = freshGateWithExecutor(async (payload) => {
    received = payload;
    return { ok: true, result: { opened: true } };
  });
  const action: ProposedAction = { capability: "SHELL_EXEC", humanSummary: "open Cursor", payload: { app: "Cursor" } };
  const outcomePromise = gate.propose(action, "open-app");
  const [request] = gate.listPendingRequests();

  await gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now() });
  const outcome = await outcomePromise;

  assert.deepEqual(received, { app: "Cursor" });
  assert.deepEqual(outcome, { ok: true, result: { opened: true } });
  assert.equal(gate.getApproval(request!.id)?.state, "executed");
  const audit = auditRows(gate);
  assert.ok(audit.some((a) => a.event === "executed"));
});

test("a failing executor keeps state 'approved' and reports the failure honestly, not a false success", async () => {
  const gate = freshGateWithExecutor(async () => ({ ok: false, error: "app not found" }));
  const action: ProposedAction = { capability: "SHELL_EXEC", humanSummary: "open Nonexistent", payload: { app: "Nonexistent" } };
  const outcomePromise = gate.propose(action, "open-app");
  const [request] = gate.listPendingRequests();

  await gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now() });
  const outcome = await outcomePromise;

  assert.deepEqual(outcome, { ok: false, reason: "error", detail: "app not found" });
  // The owner's approval was real -- only the executor failed. That's a
  // different fact than "never approved," so state stays "approved."
  assert.equal(gate.getApproval(request!.id)?.state, "approved");
  const audit = auditRows(gate);
  assert.ok(audit.some((a) => a.event === "execution_failed"));
});

test("an executor that throws is treated as a failure, not an unhandled rejection", async () => {
  const gate = freshGateWithExecutor(async () => {
    throw new Error("boom");
  });
  const action: ProposedAction = { capability: "SHELL_EXEC", humanSummary: "open X", payload: {} };
  const outcomePromise = gate.propose(action, "open-app");
  const [request] = gate.listPendingRequests();

  await gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now() });
  const outcome = await outcomePromise;

  assert.deepEqual(outcome, { ok: false, reason: "error", detail: "boom" });
});

test("a capability with no registered executor still resolves immediately with the signed execution", async () => {
  const gate = freshGateWithExecutor(async () => ({ ok: true }));
  // MEMORY_WRITE has no executor registered on this gate (only SHELL_EXEC does) -- unchanged old behavior.
  const action: ProposedAction = { capability: "MEMORY_WRITE", humanSummary: "write", payload: { x: 1 } };
  const outcomePromise = gate.propose(action, "some-skill");
  const [request] = gate.listPendingRequests();

  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now() });
  const outcome = await outcomePromise;

  assert.equal(outcome.ok, true);
  assert.equal(gate.getApproval(request!.id)?.state, "approved");
});

// Rejected/expired observation proposals used to leave `data/observations/
// *.jpg` orphaned forever -- found live, 2026-08-07 (PROGRESS.md, docs/
// BACKLOG.md). Real temp files, not mocked -- `cleanupObservationFile` uses
// real `node:fs/promises` unlink, no injected fs dependency (narrow, low-
// risk, best-effort side effect; not worth threading a fake through every
// `new Gate(...)` call site for this alone).
function tempObservationFile(): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-gate-test-"));
  const path = join(dir, "observation.jpg");
  writeFileSync(path, "fake jpeg bytes");
  return { path, dir };
}

test("rejecting an observation proposal deletes its durable image file", async () => {
  const gate = freshGate();
  const { path } = tempObservationFile();
  const action: ProposedAction = {
    capability: "MEMORY_WRITE",
    humanSummary: "remember what I saw",
    payload: { kind: "observation", imagePath: path, provider: "nim", qualitative: "a room", structured: null, confidence: 0.5 },
  };

  const outcomePromise = gate.propose(action, "look");
  const [request] = gate.listPending();
  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "reject", decidedAt: Date.now() });
  await outcomePromise;

  // unlink() is fire-and-forget inside the gate -- give its promise a tick.
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(existsSync(path), false);
});

test("an expired observation proposal (real timer) deletes its durable image file", async () => {
  const gate = freshGate();
  const { path } = tempObservationFile();
  const action: ProposedAction = {
    capability: "MEMORY_WRITE",
    humanSummary: "remember what I saw",
    payload: { kind: "observation", imagePath: path, provider: "nim", qualitative: "a room", structured: null, confidence: 0.5 },
    expiresInMs: 10,
  };

  await gate.propose(action, "look");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(existsSync(path), false);
});

test("a decision arriving after expiry also deletes the observation's image file", async () => {
  const gate = freshGate();
  const { path } = tempObservationFile();
  const action: ProposedAction = {
    capability: "MEMORY_WRITE",
    humanSummary: "remember what I saw",
    payload: { kind: "observation", imagePath: path, provider: "nim", qualitative: "a room", structured: null, confidence: 0.5 },
    expiresInMs: 60_000,
  };

  const outcomePromise = gate.propose(action, "look");
  const [request] = gate.listPending();
  gate.decide(
    { requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now() },
    () => Date.now() + 61_000,
  );
  await outcomePromise;

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(existsSync(path), false);
});

test("an approved observation proposal keeps its durable image file", async () => {
  const gate = freshGate();
  const { path } = tempObservationFile();
  const action: ProposedAction = {
    capability: "MEMORY_WRITE",
    humanSummary: "remember what I saw",
    payload: { kind: "observation", imagePath: path, provider: "nim", qualitative: "a room", structured: null, confidence: 0.5 },
  };

  const outcomePromise = gate.propose(action, "look");
  const [request] = gate.listPending();
  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now() });
  await outcomePromise;

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(existsSync(path), true);
});

test("rejecting a plain fact proposal (no imagePath) does not throw", async () => {
  const gate = freshGate();
  const action: ProposedAction = {
    capability: "MEMORY_WRITE",
    humanSummary: "remember a fact",
    payload: { kind: "fact", key: "prefs.color", value: "blue", confidence: 0.9 },
  };

  const outcomePromise = gate.propose(action, "fact-extraction");
  const [request] = gate.listPending();
  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "reject", decidedAt: Date.now() });
  const outcome = await outcomePromise;

  assert.deepEqual(outcome, { ok: false, reason: "rejected" });
});

// docs/BACKLOG.md's "tag the audit log with which channel resolved an
// approval" idea -- real forensic value, previously the audit log
// recorded *that* a decision happened, never *how*.
test("a rejection's audit entry records which channel decided it", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "SHELL_EXEC", humanSummary: "run", payload: {} };

  const outcomePromise = gate.propose(action, "some-skill");
  const [request] = gate.listPending();
  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "reject", decidedAt: Date.now(), channel: "cli" });
  await outcomePromise;

  const audit = auditRows(gate);
  const rejected = audit.find((a) => a.event === "rejected");
  assert.deepEqual(rejected?.detail, { channel: "cli" });
});

test("an approval's audit entry records the dashboard channel", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "MEMORY_WRITE", humanSummary: "write", payload: {} };

  const outcomePromise = gate.propose(action, "some-skill");
  const [request] = gate.listPending();
  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "approve", decidedAt: Date.now(), channel: "dashboard" });
  await outcomePromise;

  const audit = auditRows(gate);
  const approved = audit.find((a) => a.event === "approved");
  assert.deepEqual(approved?.detail, { channel: "dashboard" });
});

test("a decision with no channel set (an older/unspecified client) logs cleanly, channel undefined", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "SHELL_EXEC", humanSummary: "run", payload: {} };

  const outcomePromise = gate.propose(action, "some-skill");
  const [request] = gate.listPending();
  gate.decide({ requestId: request!.id, nonce: request!.nonce, decision: "reject", decidedAt: Date.now() });
  await outcomePromise;

  const audit = auditRows(gate);
  const rejected = audit.find((a) => a.event === "rejected");
  assert.equal((rejected?.detail as { channel?: string })?.channel, undefined);
});

test("a natural timeout expiry (no decide() call at all) has no channel -- nothing decided it", async () => {
  const gate = freshGate();
  const action: ProposedAction = { capability: "SHELL_EXEC", humanSummary: "run", payload: {}, expiresInMs: 10 };

  await gate.propose(action, "some-skill");

  const audit = auditRows(gate);
  const expired = audit.find((a) => a.event === "expired");
  assert.equal((expired?.detail as { channel?: string })?.channel, undefined);
});

// --- adversarial: the security properties the whole gate rests on ----
// Added 2026-08-17. These invariants were load-bearing but untested: the
// existing suite proves the state machine's happy and sad paths, not
// that the boundary holds against a caller actively trying to get two
// executions, a forged signature, or an action out of a spent request.

test("two concurrent approvals of the same request execute the action exactly ONCE", async () => {
  let runs = 0;
  const gate = freshGateWithExecutor(async () => {
    runs++;
    // Yield, so a second decide() would have every chance to interleave
    // if the guard were weaker than it is.
    await new Promise((r) => setTimeout(r, 20));
    return { ok: true, result: runs };
  });
  const action: ProposedAction = { capability: "SHELL_EXEC", humanSummary: "run it", payload: { cmd: "x" } };
  const pending = gate.propose(action, "s");
  const row = gate.listPending()[0]!;

  // Fired without awaiting between them -- the real double-click shape.
  await Promise.all([
    gate.decide({ requestId: row.id, nonce: row.nonce, decision: "approve", decidedAt: Date.now(), channel: "dashboard" }),
    gate.decide({ requestId: row.id, nonce: row.nonce, decision: "approve", decidedAt: Date.now(), channel: "dashboard" }),
  ]);
  await pending;

  assert.equal(runs, 1, "an approved action must never run twice");
  // The loser is logged as a replay, not silently dropped.
  assert.ok(auditRows(gate).some((r) => r.event === "rejected" && (r.detail as { reason?: string }).reason === "replay"));
});

test("approve and reject racing on the same request settle exactly one way, and the action runs at most once", async () => {
  let runs = 0;
  const gate = freshGateWithExecutor(async () => {
    runs++;
    return { ok: true, result: null };
  });
  const pending = gate.propose({ capability: "SHELL_EXEC", humanSummary: "run it", payload: {} }, "s");
  const row = gate.listPending()[0]!;

  await Promise.all([
    gate.decide({ requestId: row.id, nonce: row.nonce, decision: "approve", decidedAt: Date.now(), channel: "dashboard" }),
    gate.decide({ requestId: row.id, nonce: row.nonce, decision: "reject", decidedAt: Date.now(), channel: "cli" }),
  ]);
  const outcome = await pending;

  assert.ok(runs <= 1, "the action must not run twice under a race");
  // Whichever won, the request is settled and no longer pending.
  assert.equal(gate.listPending().length, 0);
  assert.ok(outcome.ok === true || outcome.reason === "rejected");
});

test("a tampered payload fails signature verification -- the executor is never called", async () => {
  const { sign, verify } = await import("../hmac.ts");
  const signed = sign(KEY, "req-1", "nonce-1", { cmd: "ls" }, 1000);

  assert.equal(verify(KEY, signed), true, "the untampered signature must verify");

  // Every field the signature covers, mutated one at a time.
  assert.equal(verify(KEY, { ...signed, payload: { cmd: "rm -rf /" } }), false, "payload swap must fail");
  assert.equal(verify(KEY, { ...signed, requestId: "req-2" }), false, "id swap must fail");
  assert.equal(verify(KEY, { ...signed, nonce: "nonce-2" }), false, "nonce swap must fail");
  assert.equal(verify(KEY, { ...signed, signature: signed.signature.replace(/.$/, "0") }), false, "signature edit must fail");
  // A different key must not verify -- otherwise the key isn't doing anything.
  assert.equal(verify("another-key", signed), false);
});

test("a signature from a DIFFERENT request cannot be pasted onto this one", async () => {
  const { sign, verify } = await import("../hmac.ts");
  const a = sign(KEY, "req-a", "nonce-a", { cmd: "safe" }, 1000);
  const b = sign(KEY, "req-b", "nonce-b", { cmd: "dangerous" }, 1000);

  // Cross-pasting either half must fail: this is what binds a signature
  // to one specific approval rather than to a payload shape.
  assert.equal(verify(KEY, { ...a, signature: b.signature }), false);
  assert.equal(verify(KEY, { ...b, signature: a.signature }), false);
});

test("issuedAt IS covered by the signature -- a future out-of-process executor can trust it", async () => {
  const { sign, verify } = await import("../hmac.ts");
  const signed = sign(KEY, "req-1", "nonce-1", { cmd: "ls" }, 1000);

  // Until 2026-08-17 this returned true: the timestamp could be changed
  // freely and still verify. Harmless in-process (freshness comes from
  // the gate's own expires_at check against the DB row), but a webhook
  // executor has no DB row to check -- an unsigned timestamp would hand
  // it a replay window. See hmac.ts's canonicalPayload comment.
  assert.equal(verify(KEY, { ...signed, issuedAt: 999999 }), false);
  assert.equal(verify(KEY, signed), true);
});

test("a spent request cannot be revived: decide() after it settled is always a replay", async () => {
  const gate = freshGate();
  const pending = gate.propose({ capability: "SHELL_EXEC", humanSummary: "x", payload: {} }, "s");
  const row = gate.listPending()[0]!;

  await gate.decide({ requestId: row.id, nonce: row.nonce, decision: "reject", decidedAt: Date.now(), channel: "cli" });
  await pending;

  // Same id, same nonce, now approving -- must not resurrect it.
  await gate.decide({ requestId: row.id, nonce: row.nonce, decision: "approve", decidedAt: Date.now(), channel: "dashboard" });

  assert.equal(gate.getApproval(row.id)?.state, "rejected", "state must not move after settling");
  const replays = auditRows(gate).filter((r) => r.event === "rejected" && (r.detail as { reason?: string }).reason === "replay");
  assert.equal(replays.length, 1);
});

test("a decision for an id that never existed is a logged replay, not a crash", async () => {
  const gate = freshGate();
  await gate.decide({ requestId: "no-such-id", nonce: "whatever", decision: "approve", decidedAt: Date.now(), channel: "dashboard" });
  assert.ok(auditRows(gate).some((r) => r.event === "rejected" && (r.detail as { reason?: string }).reason === "replay"));
});

test("timingSafeEqualStrings is correct on every shape it actually sees", async () => {
  const { timingSafeEqualStrings: eq } = await import("../hmac.ts");
  assert.equal(eq("", ""), true);
  assert.equal(eq("abc", "abc"), true);
  assert.equal(eq("abc", "abd"), false);
  assert.equal(eq("abc", "ab"), false, "a prefix must not compare equal");
  assert.equal(eq("ab", "abc"), false);
  // Non-ASCII: the loop compares char codes, so this must still hold.
  assert.equal(eq("ção", "ção"), true);
  assert.equal(eq("ção", "cao"), false);
});
