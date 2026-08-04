/**
 * core/http.ts — the dashboard's historical-query endpoints. `core/ws.ts`
 * carries live events forward from "now"; a freshly opened tab needs a
 * backfill, which is what `ServerEvent` deliberately has no generic
 * fetch-history variant for (SPEC.md's live channel is push-only).
 *
 * Plain `node:http`, no framework — two routes, no reason for one.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Gate } from "./gate/gate.ts";
import type { Memory } from "./memory/memory.ts";
import type { SkillRegistry } from "./skills/registry.ts";
import { getSystemMetrics } from "./systemMetrics.ts";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

// CORS is safe here: every response is either the owner's own conversation
// history or a pending-approval summary, never a credential, and the
// dashboard is the only intended caller (localhost-only in practice) --
// but the browser still needs the header since `ui/` runs on its own
// Next.js dev port, a different origin from this server's port.
function withCors(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
}

export function createHttpServer(memory: Memory, skillRegistry: SkillRegistry, gate: Gate): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    withCors(res);
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/api/events") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500);
      sendJson(res, 200, memory.recentEvents(limit));
      return;
    }

    if (url.pathname === "/api/skills") {
      sendJson(res, 200, skillRegistry.listHealth());
      return;
    }

    if (url.pathname === "/api/approvals") {
      sendJson(res, 200, gate.listPendingRequests());
      return;
    }

    if (url.pathname === "/api/system") {
      sendJson(res, 200, getSystemMetrics());
      return;
    }

    sendJson(res, 404, { error: "not found" });
  });
}
