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
import { ALLOWED_ORIGIN } from "./http.ts";
import type { Gate } from "./gate/gate.ts";
import type { Memory } from "./memory/memory.ts";
import type { ClientEvent, ServerEvent } from "../shared/types.ts";

export interface WsHub {
  broadcast(event: ServerEvent): void;
  close(): Promise<void>;
}

/** Wires a `WebSocketServer` onto an existing `http.Server` (so the
 * dashboard's WS and HTTP history endpoints share one port), subscribes
 * to `Gate`'s lifecycle events, relays `approval.decide` from any client
 * into `gate.decide()`, stores `feedback` ratings and rebroadcasts them
 * (same "state lives in core, two tabs stay in sync" reasoning as
 * approvals), and hands `utterance.inject` (SOAK 1's dashboard test
 * console) to `onUtterance` -- `core/main.ts`'s own real handling path,
 * unchanged, so an injected line and a real transcribed one are
 * indistinguishable once they land. */
export function createWsHub(
  httpServer: HttpServer,
  gate: Gate,
  memory: Memory,
  onUtterance: (text: string) => void,
  onGestureBlur?: (enabled: boolean) => void,
): WsHub {
  // Found live in a security review (2026-08-06): without this, `ws`
  // accepts a connection from *any* origin, and the message handler below
  // processes "approval.decide" from whatever connects with zero further
  // auth -- a page in another browser tab (any origin at all) could open
  // this socket, read the `nonce` broadcast in every real "approval.new"
  // event, and approve a pending yellow-tier action itself. This is a
  // browser-enforced check (a raw non-browser client can still lie about
  // its Origin header), not a cryptographic one -- real defense-in-depth
  // needs a shared local auth token too; tracked as a follow-up, not
  // blocking this fix, which closes the actual live exploit path (any
  // webpage the owner has open forging an approval with no interaction).
  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (info: { origin: string }) => info.origin === ALLOWED_ORIGIN,
  });

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
      if (event.type === "utterance.inject") {
        const text = event.text.trim();
        if (text) onUtterance(text);
      }
      if (event.type === "feedback") {
        memory.setFeedback(event.eventId, event.rating);
        broadcast({ type: "feedback", eventId: event.eventId, rating: event.rating });
      }
      if (event.type === "gesture.blur") {
        onGestureBlur?.(event.enabled);
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
