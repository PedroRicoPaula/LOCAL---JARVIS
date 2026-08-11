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
