/**
 * core/gate/gate.ts — the `ApprovalRequest` lifecycle (SPEC.md § 8):
 *
 *   pending --approve--> approved --execute--> executed
 *      |
 *      +--reject--> rejected
 *      +--timeout-> expired
 *
 * State lives here, server-side (`core`), enforced by this module alone —
 * "the dashboard is a view, never an authority" (SPEC.md § 8) applies
 * just as much to the CLI in `cli.ts` before a dashboard exists.
 *
 * A green-tier `ProposedAction` skips this lifecycle entirely — it runs
 * unprompted, per CLAUDE.md § 5's table, but is still logged (SPEC.md § 8
 * / CLAUDE.md § 5: every tier is logged, only yellow/red block).
 */

import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { unlink } from "node:fs/promises";
import { ulid } from "ulid";
import type {
  ApprovalOutcome,
  ApprovalRequest,
  ApprovalResponse,
  ApprovalState,
  Capability,
  ProposedAction,
} from "../../shared/types.ts";
import { GREEN_CAPABILITIES } from "../../shared/types.ts";
import { ensureGateSchema } from "./db.ts";
import { sign, timingSafeEqualStrings, verify } from "./hmac.ts";

export const DEFAULT_EXPIRY_MS = 5 * 60_000; // SPEC.md SS8: "expiresAt (default 5 min)"

export type CapabilityTier = "green" | "yellow";

/** What actually performs a side effect, invoked *by the gate* on
 * approval (SPEC.md § 38: "Only executors invoked by the gate cause
 * [side effects]") -- never by a skill directly, which is why skills
 * can't import `core/executors/**` at all (ESLint-enforced). Takes the
 * already-verified payload from the signed execution; returns whether
 * the real action succeeded. */
export type Executor = (payload: unknown) => Promise<{ ok: boolean; result?: unknown; error?: string }>;

/** Red capabilities have no representation in the `Capability` type at
 * all (see shared/types.ts's own comment) -- nothing here can be asked to
 * classify one, by construction, matching CLAUDE.md § 5's "never
 * proposed by a model." */
export function capabilityTier(capability: Capability): CapabilityTier {
  return GREEN_CAPABILITIES.includes(capability) ? "green" : "yellow";
}

interface ApprovalRow {
  id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  capability: string;
  skill_id: string;
  human_summary: string;
  payload: string;
  diff: string | null;
  state: ApprovalState;
}

interface PendingEntry {
  resolve: (outcome: ApprovalOutcome) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

function rowToRequest(row: ApprovalRow): ApprovalRequest {
  const request: ApprovalRequest = {
    id: row.id,
    nonce: row.nonce,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    capability: row.capability as Capability,
    skillId: row.skill_id,
    humanSummary: row.human_summary,
    payload: JSON.parse(row.payload),
    state: row.state,
  };
  if (row.diff !== null) request.diff = row.diff;
  return request;
}

/** Emits `"approval.new"` (full `ApprovalRequest`, wire-shaped) and
 * `"approval.resolved"` (`{requestId, state}`) — `core/ws.ts` (Phase 7)
 * subscribes to these to broadcast `ServerEvent`s to the dashboard. The
 * dashboard is a *view*: it hears about state changes here, it never
 * causes one except through `decide()` (SPEC.md § 8). */
export class Gate extends EventEmitter {
  private readonly db: DatabaseSync;
  private readonly signingKey: string;
  private readonly pending = new Map<string, PendingEntry>();
  private readonly executors: Partial<Record<Capability, Executor>>;

  constructor(db: DatabaseSync, signingKey: string, executors: Partial<Record<Capability, Executor>> = {}) {
    super();
    this.db = db;
    this.signingKey = signingKey;
    this.executors = executors;
    ensureGateSchema(db);
  }

  async propose(action: ProposedAction, skillId: string, now: () => number = Date.now): Promise<ApprovalOutcome> {
    const tier = capabilityTier(action.capability);

    if (tier === "green") {
      this.logAudit(null, "green_auto_run", { capability: action.capability, skillId, humanSummary: action.humanSummary });
      const executor = this.executors[action.capability];
      // No registered executor (true for every green capability so far
      // -- CAMERA/MEMORY_READ/FS_READ/NET_READ are all read straight off
      // ctx.camera/ctx.memory/ctx.fs or a plain fetch, never through
      // propose()) -- same "nothing to actually run" shape `decide()`
      // already has for an unregistered yellow capability.
      if (!executor) {
        return { ok: true, result: action.payload };
      }
      // A real bug, found live 2026-08-07 building the first green
      // capability that *does* need a real executor (APP_CONTROL): this
      // branch used to return `{ok: true}` without ever calling the
      // executor at all, so "runs unprompted" (this class's own
      // docstring) silently meant "never actually runs." Mirrors
      // `decide()`'s own executor-invocation shape below, minus the
      // approval-row/nonce/signature machinery green tier has no use
      // for (skipping the wait is the whole point).
      let execResult: { ok: boolean; result?: unknown; error?: string };
      try {
        execResult = await executor(action.payload);
      } catch (cause) {
        execResult = { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
      }
      if (execResult.ok) {
        this.logAudit(null, "executed", { capability: action.capability, skillId, result: execResult.result ?? null });
        return { ok: true, result: execResult.result ?? action.payload };
      }
      const errorDetail = execResult.error ?? "unknown";
      this.logAudit(null, "execution_failed", { capability: action.capability, skillId, error: errorDetail });
      return { ok: false, reason: "error", detail: errorDetail };
    }

    const id = ulid();
    const nonce = randomUUID();
    const createdAt = now();
    const expiresAt = createdAt + (action.expiresInMs ?? DEFAULT_EXPIRY_MS);

    const row: ApprovalRow = {
      id,
      nonce,
      created_at: createdAt,
      expires_at: expiresAt,
      capability: action.capability,
      skill_id: skillId,
      human_summary: action.humanSummary,
      payload: JSON.stringify(action.payload),
      diff: action.diff ?? null,
      state: "pending",
    };
    this.insertApproval(row);
    this.logAudit(id, "created", { capability: action.capability, skillId, humanSummary: action.humanSummary });
    this.emit("approval.new", rowToRequest(row));

    return new Promise<ApprovalOutcome>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(id);
        this.setState(id, "expired");
        this.logAudit(id, "expired", {});
        this.emit("approval.resolved", { requestId: id, state: "expired" });
        this.cleanupObservationFile(row);
        resolve({ ok: false, reason: "expired" });
      }, Math.max(0, expiresAt - createdAt));
      this.pending.set(id, { resolve, timeoutHandle });
    });
  }

  /** The only way a `pending` approval is ever resolved by an owner
   * decision. A response for anything not currently `pending` — already
   * decided, already expired, or a nonce that doesn't match — fails
   * closed and is logged as a rejection with `reason: "replay"`,
   * verbatim SPEC.md § 8's own wording.
   *
   * Approving a capability with no registered `Executor` resolves
   * immediately with the signed execution and stops at `approved` —
   * unchanged from before executors existed (still true for every
   * capability nothing is registered for yet, e.g. `MEMORY_WRITE`).
   * Approving one *with* a registered executor calls it, then settles
   * `executed` on success or reports the failure honestly (`reason:
   * "error"`) rather than pretending an approved request always
   * happened -- CLAUDE.md § 6 applies to "it worked" the same way it
   * applies to any other claim. */
  async decide(response: ApprovalResponse, now: () => number = Date.now): Promise<void> {
    const row = this.getApprovalRow(response.requestId);

    if (!row || row.state !== "pending" || !timingSafeEqualStrings(row.nonce, response.nonce)) {
      this.logAudit(response.requestId, "rejected", { reason: "replay" });
      return;
    }

    if (now() > row.expires_at) {
      this.settlePending(row.id, "expired", { ok: false, reason: "expired" });
      this.cleanupObservationFile(row);
      return;
    }

    if (response.decision !== "approve") {
      this.settlePending(row.id, "rejected", { ok: false, reason: "rejected" });
      this.cleanupObservationFile(row);
      return;
    }

    const signed = sign(this.signingKey, row.id, row.nonce, JSON.parse(row.payload), now());
    // Found live during a code review (2026-08-06): this signature was
    // being created and then never checked -- `sign()`'s whole purpose
    // (SPEC.md § 8, this file's own `Executor` type docstring above: "the
    // already-verified payload") is to give an executor a payload it can
    // trust came from *this* approval, not a tampered or reconstructed
    // one. In-process today that adds no defense against an external
    // attacker (nothing untrusted sits between sign() and the executor
    // call), but it's cheap, matches the documented contract, and is
    // exactly the check a future out-of-process executor (SPEC.md § 8's
    // n8n webhook case, ROADMAP Phase 13) will actually depend on for
    // real. Failing closed here, not just logging, so a future refactor
    // that breaks this invariant fails loudly instead of silently.
    if (!verify(this.signingKey, signed)) {
      this.setState(row.id, "approved");
      this.logAudit(row.id, "approved", {});
      this.logAudit(row.id, "execution_failed", { error: "signature verification failed" });
      this.emit("approval.resolved", { requestId: row.id, state: "approved" });
      this.resolvePending(row.id, { ok: false, reason: "error", detail: "signature verification failed" });
      return;
    }
    const executor = this.executors[row.capability as Capability];
    if (!executor) {
      this.settlePending(row.id, "approved", { ok: true, result: signed });
      return;
    }

    this.setState(row.id, "approved");
    this.logAudit(row.id, "approved", {});
    this.emit("approval.resolved", { requestId: row.id, state: "approved" });

    let execResult: { ok: boolean; result?: unknown; error?: string };
    try {
      execResult = await executor(signed.payload);
    } catch (cause) {
      execResult = { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
    }

    if (execResult.ok) {
      this.setState(row.id, "executed");
      this.logAudit(row.id, "executed", { result: execResult.result ?? null });
      this.emit("approval.resolved", { requestId: row.id, state: "executed" });
      this.resolvePending(row.id, { ok: true, result: execResult.result ?? signed });
    } else {
      const errorDetail = execResult.error ?? "unknown";
      this.logAudit(row.id, "execution_failed", { error: errorDetail });
      // State stays "approved" -- the owner's decision was honored,
      // only the executor itself failed, a distinct fact worth keeping
      // separate in the audit trail.
      this.resolvePending(row.id, { ok: false, reason: "error", detail: errorDetail });
    }
  }

  /** Called by an executor once it has verified the signed execution and
   * actually performed the action -- for a capability with no
   * `Executor` registered on this `Gate` instance (nothing calls this
   * automatically for those; `decide()` handles registered ones
   * itself). Kept for that manual/external path. */
  markExecuted(id: string): boolean {
    const row = this.getApprovalRow(id);
    if (!row || row.state !== "approved") return false;
    this.setState(id, "executed");
    this.logAudit(id, "executed", {});
    return true;
  }

  getApproval(id: string): ApprovalRow | null {
    return this.getApprovalRow(id);
  }

  listPending(): ApprovalRow[] {
    return (
      this.db.prepare("SELECT * FROM approvals WHERE state = 'pending' ORDER BY created_at").all() as unknown as ApprovalRow[]
    );
  }

  /** Wire-shaped, for a freshly opened dashboard tab to backfill —
   * `"approval.new"` is a live broadcast, not a replay log (SPEC.md § 8:
   * "close the browser mid-approval, request survives, still pending"
   * means this endpoint, not WS history). */
  listPendingRequests(): ApprovalRequest[] {
    return this.listPending().map(rowToRequest);
  }

  private settlePending(id: string, state: ApprovalState, outcome: ApprovalOutcome): void {
    this.setState(id, state);
    this.logAudit(id, state === "approved" ? "approved" : state, {});
    this.emit("approval.resolved", { requestId: id, state });
    this.resolvePending(id, outcome);
  }

  /** Just the in-memory half of settling (clear the timer, resolve the
   * `propose()` caller) -- split out from `settlePending` for the
   * approved-with-executor path in `decide()`, which needs to update the
   * DB/audit/emit *before* the executor runs (state becomes `approved`
   * right away) but only resolve the caller's `Promise` after it
   * finishes. */
  private resolvePending(id: string, outcome: ApprovalOutcome): void {
    const entry = this.pending.get(id);
    if (entry) {
      clearTimeout(entry.timeoutHandle);
      this.pending.delete(id);
    }
    entry?.resolve(outcome);
  }

  /** Rejected/expired `MEMORY_WRITE` `kind: "observation"` proposals leave
   * `skills/look`'s durable `data/observations/*.jpg` copy (ADR-045)
   * unreferenced by any DB row forever -- confirmed live, 2026-08-07
   * (PROGRESS.md's dated entry, `docs/BACKLOG.md`'s Annoyances section):
   * a real photo's approval expired unactioned and the file just sat on
   * disk. Only fires for a `kind: "observation"` payload (a `kind: "fact"`
   * proposal has no file to clean up); best-effort and silent on a
   * missing file (already gone is not an error worth logging). */
  private cleanupObservationFile(row: ApprovalRow): void {
    if (row.capability !== "MEMORY_WRITE") return;
    let payload: unknown;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      return;
    }
    if (typeof payload !== "object" || payload === null) return;
    const p = payload as Record<string, unknown>;
    if (p["kind"] !== "observation" || typeof p["imagePath"] !== "string" || !p["imagePath"]) return;
    const imagePath = p["imagePath"];
    unlink(imagePath).catch((err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.error(`gate: failed to delete orphaned observation file ${imagePath}`, err);
      }
    });
  }

  private insertApproval(row: ApprovalRow): void {
    this.db
      .prepare(
        `INSERT INTO approvals (id, nonce, created_at, expires_at, capability, skill_id, human_summary, payload, diff, state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.nonce,
        row.created_at,
        row.expires_at,
        row.capability,
        row.skill_id,
        row.human_summary,
        row.payload,
        row.diff,
        row.state,
      );
  }

  private getApprovalRow(id: string): ApprovalRow | null {
    const row = this.db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as unknown as ApprovalRow | undefined;
    return row ?? null;
  }

  private setState(id: string, state: ApprovalState): void {
    this.db.prepare("UPDATE approvals SET state = ? WHERE id = ?").run(state, id);
  }

  private logAudit(approvalId: string | null, event: string, detail: Record<string, unknown>): void {
    this.db
      .prepare("INSERT INTO audit_log (id, ts, approval_id, event, detail) VALUES (?, ?, ?, ?, ?)")
      .run(ulid(), Date.now(), approvalId, event, JSON.stringify(detail));
  }
}
