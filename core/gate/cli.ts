/**
 * core/gate/cli.ts — the owner's only way to answer a pending approval
 * before Phase 7's dashboard exists: type `approve <id>` / `reject <id>`
 * into the same terminal `make dev` is already running in.
 *
 * Not a separate process talking over IPC — `Gate`'s pending approvals
 * are resolved via in-memory `Promise` resolvers (`gate.ts`'s `pending`
 * map), tied to the one `core` process that created them. A standalone
 * CLI script run separately couldn't reach those resolvers no matter what
 * it wrote to the database; only something running inside the same
 * process core does. `shared/types.ts`'s `approval.decide` client event
 * exists for exactly this over a WebSocket once Phase 7 builds one —
 * this is the boring, no-new-infrastructure equivalent for now.
 */

import { createInterface } from "node:readline/promises";
import type { Gate } from "./gate.ts";

function printPending(gate: Gate): void {
  const pending = gate.listPending();
  if (pending.length === 0) {
    console.log("gate: no pending approvals");
    return;
  }
  for (const p of pending) {
    console.log(`gate: [${p.id}] ${p.capability} — ${p.human_summary} (nonce ${p.nonce})`);
  }
}

/** Runs forever, reading `approve <id>`, `reject <id>`, or `list` lines
 * from stdin. Started alongside (not instead of) the ears/voice loop in
 * `core/main.ts` — both are just concurrent async loops on the same
 * event loop, nothing special. */
export async function watchApprovalCommands(gate: Gate): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('gate: type "list", "approve <id>", or "reject <id>" to answer a pending approval');

  for await (const line of rl) {
    const [command, id] = line.trim().split(/\s+/);
    if (command === "list") {
      printPending(gate);
      continue;
    }
    if (command !== "approve" && command !== "reject") {
      if (command) console.log(`gate: unknown command ${JSON.stringify(command)}`);
      continue;
    }
    if (!id) {
      console.log("gate: usage: approve <id> | reject <id>");
      continue;
    }
    const approval = gate.getApproval(id);
    if (!approval) {
      console.log(`gate: no approval with id ${JSON.stringify(id)} — try "list"`);
      continue;
    }
    gate.decide({
      requestId: approval.id,
      nonce: approval.nonce,
      decision: command === "approve" ? "approve" : "reject",
      decidedAt: Date.now(),
    });
    console.log(`gate: ${command}d ${id}`);
  }
}
