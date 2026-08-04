/**
 * core/dashboardHistory.ts — the backfill gap `core/ws.ts`'s own docstring
 * already warns about ("push-only... no replay") but that only Transcript
 * and Approvals were ever actually fixed for (ADR-023's transcript
 * backfill; approvals via `/api/approvals`). Found live, SOAK 1: a fresh
 * dashboard tab showed "No routing activity yet." in Thought Stream and
 * nothing in the Error Log even seconds after a real routing decision or
 * a real error had already happened — the same class of bug, never
 * generalized to these two panels.
 *
 * Deliberately NOT stored in the `events` table (`Memory.recall()`'s own
 * source): routing telemetry and error text mixed into conversation
 * recall would resurface as "relevant memory" in a later turn, and a
 * weak fallback model has already been observed (ADR-026/ADR-027) copying
 * recalled text verbatim into what it says out loud. A small in-process
 * ring buffer, isolated from recall, is the boring fix — same caps the
 * client already applies to live events (`use-jarvis.ts`'s `.slice(-49)`/
 * `.slice(-19)`), just also served as an initial snapshot.
 */

import type { ServerEvent } from "../shared/types.ts";

type ThoughtEvent = Extract<ServerEvent, { type: "thought" }>;
type ErrorEvent = Extract<ServerEvent, { type: "error" }>;

const MAX_THOUGHTS = 50;
const MAX_ERRORS = 20;

export interface DashboardHistory {
  recordThought(event: ThoughtEvent): void;
  recordError(event: ErrorEvent): void;
  recentThoughts(): ThoughtEvent[];
  recentErrors(): ErrorEvent[];
}

export function createDashboardHistory(): DashboardHistory {
  const thoughts: ThoughtEvent[] = [];
  const errors: ErrorEvent[] = [];

  return {
    recordThought(event) {
      thoughts.push(event);
      if (thoughts.length > MAX_THOUGHTS) thoughts.shift();
    },
    recordError(event) {
      errors.push(event);
      if (errors.length > MAX_ERRORS) errors.shift();
    },
    recentThoughts: () => [...thoughts],
    recentErrors: () => [...errors],
  };
}
