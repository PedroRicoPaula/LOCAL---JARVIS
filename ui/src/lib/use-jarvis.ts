"use client";

/**
 * ui/src/lib/use-jarvis.ts — the dashboard's one connection to `core`.
 *
 * `core/ws.ts` is push-only (SPEC.md: the live channel has no replay), so
 * a freshly opened tab backfills from the `/api/*` endpoints first, then
 * layers live `ServerEvent`s on top — this is what makes "close the
 * browser mid-approval, still pending on reopen" (ROADMAP.md's Phase 7
 * DoD) true: the pending approval comes back from `/api/approvals`, not
 * from a WS event that already fired before this tab existed. Transcript
 * backfills the same way, from `/api/events` filtered to the two kinds a
 * conversation is made of — a reopened tab shouldn't show "waiting for
 * the first utterance" when the conversation is sitting right there.
 *
 * Two tabs stay in sync for the same reason two callers of `Gate.decide`
 * always have: state lives in `core`, not here. Every tab is just another
 * WS subscriber.
 */

import { useEffect, useRef, useState } from "react";
import type { ApprovalRequest, ClientEvent, JarvisState, MemoryEvent, ServerEvent, SkillHealth, SystemMetrics } from "./types";

const CORE_URL = process.env["NEXT_PUBLIC_JARVIS_CORE_URL"] ?? "http://localhost:8787";
const WS_URL = CORE_URL.replace(/^http/, "ws");
const RECONNECT_DELAY_MS = 2000;
const SYSTEM_POLL_MS = 5000;

export type ConnectionState = "connecting" | "open" | "closed";

/** `speaking` is layered on top of `state` (a separate, real signal from
 * `senses/voice`, not a guess) -- when active it takes visual priority
 * over whatever `state` says, since it's the more specific fact. */
export type OrbState = JarvisState | "speaking";

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

export interface JarvisError {
  message: string;
  detail?: string;
  ts: number;
}

export interface JarvisDashboardState {
  connection: ConnectionState;
  connectedSince: number | null;
  orbState: OrbState;
  approvals: ApprovalRequest[];
  transcript: TranscriptLine[];
  thoughts: Thought[];
  events: MemoryEvent[];
  skills: SkillHealth[];
  errors: JarvisError[];
  system: SystemMetrics | null;
  decide(request: ApprovalRequest, decision: "approve" | "reject"): void;
  refreshSkills(): void;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${CORE_URL}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

function eventToTranscriptLine(e: MemoryEvent): TranscriptLine | null {
  if (e.kind === "utterance") return { text: e.content, speaker: "owner", ts: e.ts };
  if (e.kind === "response") return { text: e.content, speaker: "jarvis", ts: e.ts };
  return null;
}

export function useJarvis(): JarvisDashboardState {
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [connectedSince, setConnectedSince] = useState<number | null>(null);
  const [state, setState] = useState<JarvisState>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [events, setEvents] = useState<MemoryEvent[]>([]);
  const [skills, setSkills] = useState<SkillHealth[]>([]);
  const [errors, setErrors] = useState<JarvisError[]>([]);
  const [system, setSystem] = useState<SystemMetrics | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const refreshSkills = () => {
    fetchJson<SkillHealth[]>("/api/skills").then(setSkills).catch(() => undefined);
  };

  useEffect(() => {
    fetchJson<ApprovalRequest[]>("/api/approvals").then(setApprovals).catch(() => undefined);
    fetchJson<MemoryEvent[]>("/api/events?limit=100").then((all) => {
      setEvents(all);
      setTranscript(all.map(eventToTranscriptLine).filter((l): l is TranscriptLine => l !== null));
    }).catch(() => undefined);
    refreshSkills();
  }, []);

  useEffect(() => {
    const poll = () => fetchJson<SystemMetrics>("/api/system").then(setSystem).catch(() => undefined);
    poll();
    const id = setInterval(poll, SYSTEM_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket;

    function connect(): void {
      if (cancelled) return;
      setConnection("connecting");
      socket = new WebSocket(WS_URL);
      wsRef.current = socket;

      socket.onopen = () => {
        setConnection("open");
        setConnectedSince(Date.now());
      };

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
          case "state":
            setState(event.value);
            break;
          case "speaking":
            setSpeaking(event.active);
            break;
          case "error":
            setErrors((prev) => [...prev.slice(-19), { message: event.message, detail: event.detail, ts: event.ts }]);
            break;
          default:
            break;
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setConnection("closed");
        setConnectedSince(null);
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

  return {
    connection,
    connectedSince,
    orbState: speaking ? "speaking" : state,
    approvals,
    transcript,
    thoughts,
    events,
    skills,
    errors,
    system,
    decide,
    refreshSkills,
  };
}
