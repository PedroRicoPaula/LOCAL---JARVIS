/**
 * core/ws.ts — the live channel to the dashboard (SPEC.md's core <-> ui
 * boundary, `shared/types.ts`'s `ServerEvent`/`ClientEvent`).
 *
 * The dashboard is a *view*, never an authority (SPEC.md § 8): every
 * `ServerEvent` here is something that already happened server-side
 * (`Gate` state, a router trace, a transcript line); the only thing a
 * client can cause is `approval.decide`, which goes straight to
 * `Gate.decide()` — the same call the CLI in `gate/cli.ts` makes. Two
 * tabs, or a tab and the CLI, are just two callers of one lifecycle.
 */

import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { Gate } from "./gate/gate.ts";
import type { ClientEvent, ServerEvent } from "../shared/types.ts";

export interface WsHub {
  broadcast(event: ServerEvent): void;
  close(): Promise<void>;
}

/** Wires a `WebSocketServer` onto an existing `http.Server` (so the
 * dashboard's WS and HTTP history endpoints share one port), subscribes
 * to `Gate`'s lifecycle events, and relays `approval.decide` from any
 * client into `gate.decide()`. */
export function createWsHub(httpServer: HttpServer, gate: Gate): WsHub {
  const wss = new WebSocketServer({ server: httpServer });

  function broadcast(event: ServerEvent): void {
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  wss.on("connection", (socket) => {
    socket.on("message", (raw) => {
      let event: ClientEvent;
      try {
        event = JSON.parse(raw.toString()) as ClientEvent;
      } catch {
        return; // malformed frame, ignore rather than crash the socket
      }
      if (event.type === "approval.decide") {
        gate.decide(event.response);
      }
      // "mute" has no server-side effect yet — noted in ROADMAP, not this phase's scope.
    });
  });

  gate.on("approval.new", (request) => broadcast({ type: "approval.new", request }));
  gate.on("approval.resolved", ({ requestId, state }) => broadcast({ type: "approval.resolved", requestId, state }));

  return {
    broadcast,
    close: () =>
      new Promise<void>((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
