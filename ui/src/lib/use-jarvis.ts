"use client";

/**
 * ui/src/lib/use-jarvis.ts — the dashboard's one connection to `core`.
 *
 * `core/ws.ts` is push-only (SPEC.md: the live channel has no replay), so
 * a freshly opened tab backfills from the `/api/*` endpoints first, then
 * layers live `ServerEvent`s on top — this is what makes "close the
 * browser mid-approval, still pending on reopen" (ROADMAP.md's Phase 7
 * DoD) true: the pending approval comes back from `/api/approvals`, not
 * from a WS event that already fired before this tab existed.
 *
 * Two tabs stay in sync for the same reason two callers of `Gate.decide`
 * always have: state lives in `core`, not here. Every tab is just another
 * WS subscriber.
 */

import { useEffect, useRef, useState } from "react";
import type { ApprovalRequest, ClientEvent, MemoryEvent, ServerEvent, SkillHealth } from "./types";

const CORE_URL = process.env["NEXT_PUBLIC_JARVIS_CORE_URL"] ?? "http://localhost:8787";
const WS_URL = CORE_URL.replace(/^http/, "ws");
const RECONNECT_DELAY_MS = 2000;

export type ConnectionState = "connecting" | "open" | "closed";

export interface Thought {
  text: string;
  lane: string;
  ts: number;
}

export interface TranscriptLine {
  text: string;
  speaker: "owner" | "jarvis";
  ts: number;
}

export interface JarvisDashboardState {
  connection: ConnectionState;
  approvals: ApprovalRequest[];
  transcript: TranscriptLine[];
  thoughts: Thought[];
  events: MemoryEvent[];
  skills: SkillHealth[];
  decide(request: ApprovalRequest, decision: "approve" | "reject"): void;
  refreshSkills(): void;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${CORE_URL}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export function useJarvis(): JarvisDashboardState {
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [events, setEvents] = useState<MemoryEvent[]>([]);
  const [skills, setSkills] = useState<SkillHealth[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const refreshSkills = () => {
    fetchJson<SkillHealth[]>("/api/skills").then(setSkills).catch(() => undefined);
  };

  useEffect(() => {
    fetchJson<ApprovalRequest[]>("/api/approvals").then(setApprovals).catch(() => undefined);
    fetchJson<MemoryEvent[]>("/api/events?limit=100").then(setEvents).catch(() => undefined);
    refreshSkills();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket;

    function connect(): void {
      if (cancelled) return;
      setConnection("connecting");
      socket = new WebSocket(WS_URL);
      wsRef.current = socket;

      socket.onopen = () => setConnection("open");

      socket.onmessage = (msg) => {
        let event: ServerEvent;
        try {
          event = JSON.parse(msg.data as string) as ServerEvent;
        } catch {
          return;
        }

        switch (event.type) {
          case "approval.new":
            setApprovals((prev) => [...prev.filter((a) => a.id !== event.request.id), event.request]);
            break;
          case "approval.resolved":
            setApprovals((prev) => prev.filter((a) => a.id !== event.requestId));
            break;
          case "transcript":
            setTranscript((prev) => [...prev, { text: event.text, speaker: event.speaker, ts: Date.now() }]);
            break;
          case "thought":
            setThoughts((prev) => [...prev.slice(-49), { text: event.text, lane: event.lane, ts: event.ts }]);
            break;
          default:
            break;
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setConnection("closed");
        setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => socket.close();
    }

    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, []);

  function decide(request: ApprovalRequest, decision: "approve" | "reject"): void {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    // Optimistic: the dashboard is a view, but there's no reason to make
    // the owner wait on the round trip to stop showing a decided request.
    setApprovals((prev) => prev.filter((a) => a.id !== request.id));
    const message: ClientEvent = {
      type: "approval.decide",
      response: { requestId: request.id, nonce: request.nonce, decision, decidedAt: Date.now() },
    };
    socket.send(JSON.stringify(message));
  }

  return { connection, approvals, transcript, thoughts, events, skills, decide, refreshSkills };
}
