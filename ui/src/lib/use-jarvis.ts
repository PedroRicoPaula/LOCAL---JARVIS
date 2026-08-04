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
 *
 * SOAK 1 added `tasks`/`shoppingItems`/`metrics` (polled — `core` doesn't
 * push a WS event on a skill-store write, polling is the boring choice
 * for a testing tool, same interval class as `system`) and `feedback`
 * (WS-pushed, same sync-across-tabs reasoning as approvals) plus
 * `injectUtterance` for the dashboard's test console.
 */

import { useEffect, useRef, useState } from "react";
import type {
  ApprovalRequest,
  ClientEvent,
  DashboardMetrics,
  FeedbackRating,
  JarvisState,
  MemoryEvent,
  ServerEvent,
  ShoppingItem,
  SkillHealth,
  SystemMetrics,
  TaskItem,
} from "./types";

type ThoughtEvent = Extract<ServerEvent, { type: "thought" }>;
type ErrorEvent = Extract<ServerEvent, { type: "error" }>;

const CORE_URL = process.env["NEXT_PUBLIC_JARVIS_CORE_URL"] ?? "http://localhost:8787";
const WS_URL = CORE_URL.replace(/^http/, "ws");
const RECONNECT_DELAY_MS = 2000;
const SYSTEM_POLL_MS = 5000;
const STORE_POLL_MS = 3000;
const METRICS_POLL_MS = 10000;

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
  /** Absent for lines with no backing `events` row (the fallback line
   * spoken when a turn errors out) -- feedback needs a real event to
   * attach to. */
  eventId?: string;
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
  tasks: TaskItem[];
  shoppingItems: ShoppingItem[];
  metrics: DashboardMetrics | null;
  feedback: Record<string, FeedbackRating>;
  decide(request: ApprovalRequest, decision: "approve" | "reject"): void;
  refreshSkills(): void;
  injectUtterance(text: string): void;
  sendFeedback(eventId: string, rating: FeedbackRating): void;
  toggleTask(id: string): void;
  deleteTask(id: string): void;
  deleteShoppingItem(id: string): void;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${CORE_URL}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

function eventToTranscriptLine(e: MemoryEvent): TranscriptLine | null {
  if (e.kind === "utterance") return { text: e.content, speaker: "owner", ts: e.ts, eventId: e.id };
  if (e.kind === "response") return { text: e.content, speaker: "jarvis", ts: e.ts, eventId: e.id };
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
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [feedback, setFeedback] = useState<Record<string, FeedbackRating>>({});
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
    // Same backfill reasoning as transcript/approvals above (this hook's
    // own docstring, ADR-023): core/ws.ts is push-only, so a fresh tab
    // needs these seeded from history or Thought Stream/Error Log show
    // nothing until the next live event -- found live, SOAK 1.
    fetchJson<ThoughtEvent[]>("/api/thoughts").then((all) => {
      setThoughts(all.map((e) => ({ text: e.text, lane: e.lane, ts: e.ts })));
    }).catch(() => undefined);
    fetchJson<ErrorEvent[]>("/api/errors").then((all) => {
      setErrors(all.map((e) => ({ message: e.message, detail: e.detail, ts: e.ts })));
    }).catch(() => undefined);
    fetchJson<Record<string, FeedbackRating>>("/api/feedback").then(setFeedback).catch(() => undefined);
    refreshSkills();
  }, []);

  useEffect(() => {
    const poll = () => fetchJson<SystemMetrics>("/api/system").then(setSystem).catch(() => undefined);
    poll();
    const id = setInterval(poll, SYSTEM_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const poll = () => {
      fetchJson<TaskItem[]>("/api/tasks").then(setTasks).catch(() => undefined);
      fetchJson<ShoppingItem[]>("/api/shopping-list").then(setShoppingItems).catch(() => undefined);
    };
    poll();
    const id = setInterval(poll, STORE_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const poll = () => fetchJson<DashboardMetrics>("/api/metrics").then(setMetrics).catch(() => undefined);
    poll();
    const id = setInterval(poll, METRICS_POLL_MS);
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
          case "transcript": {
            const line: TranscriptLine = { text: event.text, speaker: event.speaker, ts: Date.now() };
            if (event.eventId !== undefined) line.eventId = event.eventId;
            setTranscript((prev) => [...prev, line]);
            break;
          }
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
          case "feedback":
            setFeedback((prev) => ({ ...prev, [event.eventId]: event.rating }));
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

  function send(message: ClientEvent): void {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  function decide(request: ApprovalRequest, decision: "approve" | "reject"): void {
    // Optimistic: the dashboard is a view, but there's no reason to make
    // the owner wait on the round trip to stop showing a decided request.
    setApprovals((prev) => prev.filter((a) => a.id !== request.id));
    send({ type: "approval.decide", response: { requestId: request.id, nonce: request.nonce, decision, decidedAt: Date.now() } });
  }

  function injectUtterance(text: string): void {
    send({ type: "utterance.inject", text });
  }

  function sendFeedback(eventId: string, rating: FeedbackRating): void {
    setFeedback((prev) => ({ ...prev, [eventId]: rating })); // optimistic, same reasoning as decide()
    send({ type: "feedback", eventId, rating });
  }

  async function toggleTask(id: string): Promise<void> {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))); // optimistic
    await fetch(`${CORE_URL}/api/tasks/${id}/toggle`, { method: "POST" }).catch(() => undefined);
  }

  async function deleteTask(id: string): Promise<void> {
    setTasks((prev) => prev.filter((t) => t.id !== id)); // optimistic
    await fetch(`${CORE_URL}/api/tasks/${id}`, { method: "DELETE" }).catch(() => undefined);
  }

  async function deleteShoppingItem(id: string): Promise<void> {
    setShoppingItems((prev) => prev.filter((i) => i.id !== id)); // optimistic
    await fetch(`${CORE_URL}/api/shopping-list/${id}`, { method: "DELETE" }).catch(() => undefined);
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
    tasks,
    shoppingItems,
    metrics,
    feedback,
    decide,
    refreshSkills,
    injectUtterance,
    sendFeedback,
    toggleTask,
    deleteTask,
    deleteShoppingItem,
  };
}
