/**
 * core/http.ts — the dashboard's historical-query endpoints. `core/ws.ts`
 * carries live events forward from "now"; a freshly opened tab needs a
 * backfill, which is what `ServerEvent` deliberately has no generic
 * fetch-history variant for (SPEC.md's live channel is push-only).
 *
 * Plain `node:http`, no framework.
 *
 * SOAK 1 added `/api/tasks`/`/api/shopping-list` (read + a bounded set of
 * writes onto `tasks`/`shopping_list`'s own `ctx.store` tables, so the
 * dashboard can show real CRUD happening, not just a voice log of it) and
 * `/api/metrics`/`/api/feedback` (aggregated usage data — the whole point
 * of a testing-heavy SOAK is collecting this). Deliberately two named
 * skills, not a generic "any skill's store" route — see `shared/
 * types.ts`'s `TaskItem`/`ShoppingItem` docstring for why.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import type { DashboardHistory } from "./dashboardHistory.ts";
import type { Gate } from "./gate/gate.ts";
import type { Memory } from "./memory/memory.ts";
import { computeMetrics } from "./metrics.ts";
import { createSkillStore } from "./skills/store.ts";
import type { SkillRegistry } from "./skills/registry.ts";
import { getSystemMetrics } from "./systemMetrics.ts";
import type { ShoppingItem, TaskItem } from "../shared/types.ts";

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

// `ui/` runs on its own Next.js port (3000, `next dev`/`next start`), a
// different origin from this server's own port -- the browser needs an
// explicit allow-origin, but a wildcard ("*", found live in a security
// review 2026-08-06) let *any* site the owner has open fetch() this API
// cross-origin: conversation history, pending approvals, tasks, shopping
// list. `core/main.ts` binding to 127.0.0.1 narrows *who* can reach the
// port; this narrows *which origin* a browser will allow to use it --
// both matter, neither replaces the other. Env-overridable the same way
// `JARVIS_DASHBOARD_PORT` is, for the rare case the UI runs elsewhere.
export const ALLOWED_ORIGIN = process.env["JARVIS_DASHBOARD_ORIGIN"] ?? "http://localhost:3000";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

// `DELETE`/non-GET methods trigger a real CORS preflight (OPTIONS),
// unlike the GET-only routes this had before SOAK 1.
function withCors(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", ALLOWED_ORIGIN);
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

interface TaskRow {
  id: string;
  text: string;
  done: number;
  created_at: number;
}

interface ShoppingRow {
  id: string;
  text: string;
  created_at: number;
}

export function createHttpServer(memory: Memory, skillRegistry: SkillRegistry, gate: Gate, history: DashboardHistory, db: DatabaseSync): Server {
  const tasksStore = createSkillStore(db, "tasks");
  const shoppingStore = createSkillStore(db, "shopping_list");

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    withCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean); // e.g. ["api", "tasks", "<id>", "toggle"]

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

    if (url.pathname === "/api/thoughts") {
      sendJson(res, 200, history.recentThoughts());
      return;
    }

    if (url.pathname === "/api/errors") {
      sendJson(res, 200, history.recentErrors());
      return;
    }

    if (url.pathname === "/api/feedback" && req.method === "GET") {
      sendJson(res, 200, memory.recentFeedback(200));
      return;
    }

    if (url.pathname === "/api/metrics" && req.method === "GET") {
      const since = Date.now() - DAYS_30_MS;
      sendJson(res, 200, computeMetrics(memory.recentEvents(2000), memory.routingStatsSince(since)));
      return;
    }

    // docs/BACKLOG.md's "reviewable list of routing misses" idea, built
    // 2026-08-08 -- the actual utterances that hit no_skill_matched,
    // most recent first, for closing routing gaps by reading a list
    // instead of re-reading a whole conversation log by hand.
    if (url.pathname === "/api/routing-misses" && req.method === "GET") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 500);
      sendJson(res, 200, memory.recentRoutingMisses(limit));
      return;
    }

    if (segments[0] === "api" && segments[1] === "tasks") {
      if (segments.length === 2 && req.method === "GET") {
        const rows = tasksStore.all<TaskRow>("SELECT id, text, done, created_at FROM skill_tasks_items ORDER BY created_at");
        const items: TaskItem[] = rows.map((r) => ({ id: r.id, text: r.text, done: r.done === 1, createdAt: r.created_at }));
        sendJson(res, 200, items);
        return;
      }
      if (segments.length === 4 && segments[3] === "toggle" && req.method === "POST") {
        const id = segments[2]!;
        tasksStore.run("UPDATE skill_tasks_items SET done = CASE WHEN done = 1 THEN 0 ELSE 1 END WHERE id = ?", id);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (segments.length === 3 && req.method === "DELETE") {
        const id = segments[2]!;
        tasksStore.run("DELETE FROM skill_tasks_items WHERE id = ?", id);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (segments[0] === "api" && segments[1] === "shopping-list") {
      if (segments.length === 2 && req.method === "GET") {
        const rows = shoppingStore.all<ShoppingRow>("SELECT id, text, created_at FROM skill_shopping_list_items ORDER BY created_at");
        const items: ShoppingItem[] = rows.map((r) => ({ id: r.id, text: r.text, createdAt: r.created_at }));
        sendJson(res, 200, items);
        return;
      }
      if (segments.length === 3 && req.method === "DELETE") {
        const id = segments[2]!;
        shoppingStore.run("DELETE FROM skill_shopping_list_items WHERE id = ?", id);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    sendJson(res, 404, { error: "not found" });
  });
}
