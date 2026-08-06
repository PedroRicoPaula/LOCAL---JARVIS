/**
 * core/tests/dashboardAuth.test.ts — regression coverage for a real
 * security fix (2026-08-06 code review): the dashboard's HTTP server had
 * no origin restriction (`access-control-allow-origin: *`) and its
 * WebSocket accepted `approval.decide` from any connected client with no
 * origin check at all -- together, any webpage the owner had open in
 * another tab could forge an approval. Fixed in `core/http.ts`'s
 * `ALLOWED_ORIGIN` and `core/ws.ts`'s `verifyClient`.
 *
 * A real HTTP server + real WebSocket client on an ephemeral port --
 * this is exactly the class of socket-touching logic a fake can't
 * meaningfully stand in for (same reasoning `senses/voice`'s own tests
 * use real Unix sockets, CLAUDE.md § 3).
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import WebSocket from "ws";
import { openDb } from "../memory/db.ts";
import { Gate } from "../gate/gate.ts";
import { createHttpServer } from "../http.ts";
import { Memory } from "../memory/memory.ts";
import { SkillRegistry } from "../skills/registry.ts";
import { createDashboardHistory } from "../dashboardHistory.ts";
import { createWsHub } from "../ws.ts";
import { FakeEmbedder } from "../memory/tests/fakes.ts";

const ALLOWED_ORIGIN = "http://localhost:3000";

async function setup() {
  const db = openDb(":memory:");
  const memory = new Memory(db, new FakeEmbedder());
  const gate = new Gate(db, "test-signing-key");
  const skillRegistry = new SkillRegistry();
  const history = createDashboardHistory();
  const httpServer = createHttpServer(memory, skillRegistry, gate, history, db);
  createWsHub(httpServer, gate, memory, () => {});
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (address === null || typeof address === "string") throw new Error("expected a real port");
  return { httpServer, port: address.port };
}

test("HTTP: CORS allows only the real dashboard origin, not a wildcard", async () => {
  const { httpServer, port } = await setup();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      headers: { origin: "http://evil.example" },
    });
    const allowOrigin = res.headers.get("access-control-allow-origin");
    assert.equal(allowOrigin, ALLOWED_ORIGIN);
    assert.notEqual(allowOrigin, "*");
  } finally {
    httpServer.close();
  }
});

test("WebSocket: a connection from an unrecognized origin is rejected", async () => {
  const { httpServer, port } = await setup();
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: "http://evil.example" });
    const outcome = await new Promise<"open" | "error">((resolve) => {
      ws.on("open", () => resolve("open"));
      ws.on("error", () => resolve("error"));
      ws.on("unexpected-response", () => resolve("error"));
    });
    assert.equal(outcome, "error");
  } finally {
    httpServer.close();
  }
});

test("WebSocket: a connection from the real dashboard origin is accepted", async () => {
  const { httpServer, port } = await setup();
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: ALLOWED_ORIGIN });
    const outcome = await new Promise<"open" | "error">((resolve) => {
      ws.on("open", () => resolve("open"));
      ws.on("error", () => resolve("error"));
    });
    assert.equal(outcome, "open");
    ws.close();
  } finally {
    httpServer.close();
  }
});
