/**
 * core/router/laneClassifier.ts — "the `converse` lane classifies which
 * lane a request belongs to" (SPEC.md § 3). The classification call is
 * itself routed through the `converse` lane's own provider chain, so it
 * gets the same fallback behaviour (and the same offline-degraded local
 * model) as any other `converse` request — no separate provider wiring.
 *
 * System prompt ported from `bench/bench_local.py`/`bench_nim_lane.py`
 * (single source of truth for the case set stays Python — this only needs
 * the prompt text) with one fix from DECISIONS.md ADR-001: the `reflex`
 * line now names the camera-control phrases explicitly. ADR-001 found 3 of
 * 6 `reflex` misses were exactly this — the CASES already expected them as
 * `reflex`, the prompt just never taught the model that convention.
 */

import type { ChatRequest, Lane } from "../../shared/types.ts";
import type { Registry } from "./registry.ts";
import { routeChat, type TraceSink } from "./router.ts";

export const LANE_CLASSIFIER_SYSTEM = `You are a request router for a personal assistant.
Classify the user's request into exactly one lane.

reflex   - trivial, instant, no reasoning: short control/acknowledgement phrases
           (stop, cancel, pause, that's all), asking to repeat or speak up,
           checking presence, what time is it, turning the camera on or off
converse - dialogue, small talk, recalling or counting things already known or
           already logged, telling the assistant about something to remember
           (including "log a meal" — the talking-about-it part, not writing code)
reason   - analysis, teaching, planning/strategy, explanation, comparisons,
           anything where being wrong has a cost — including planning how to
           structure or approach something, not just technical questions
see      - requires the camera to look at something real and current in front
           of the owner right now to answer — physical objects, wiring, food,
           clothing, labels, screens. If answering truthfully requires seeing
           something the assistant has no other way to know, it is see, even
           if the sentence doesn't say "look" or "camera".
act      - requires changing files, running commands, or writing/editing code

Examples of easily-confused cases:
- "say that again" / "louder" / "are you there" -> reflex (control phrases
  about the conversation mechanics itself: volume, repetition, presence)
- "good morning" / "thanks, that was helpful" / "summarise what you just
  told me" -> converse, NOT reflex — these are dialogue with actual content
  (a greeting, gratitude, a summarisation request), not a mechanical control
  command. reflex is only for the narrow conversation-mechanics set above
  plus stop/cancel/pause/time/camera-power — nothing else.
- "how many meals did I log this week" / "remind me what we decided" ->
  converse (recalling existing records, not analysis)
- "how should I structure the onboarding for a free trial" -> reason
  (a planning/strategy judgment call, even without technical jargon)
- "here's my lunch, help me log it" / "check my wiring" / "is this resistor
  the right one" -> see (needs to look at a real physical thing right now)
- "how's my computer doing" / "check my cpu usage" / "how much memory am I
  using" / "check disk space" / "check system health" -> converse, NOT see
  and NOT reason — these ask about software/OS state the assistant reads
  directly, no camera and no deep analysis involved. Contrast with "check
  my wiring": that needs eyes on a real physical thing; "check my cpu
  usage" needs no eyes at all, just a number.
- "run the tests" / "rename that file to X" / "add a dark mode toggle" ->
  act, NOT reflex or converse — being short and imperative does not make
  something reflex; reflex is only the narrow named set above. Anything
  that runs a command, touches a file, or changes code is act regardless
  of sentence length.

Respond with JSON only. No prose, no markdown fences.
Schema: {"lane": "<lane>", "confidence": <0..1>}`;

const VALID_LANES: readonly Lane[] = ["reflex", "converse", "reason", "see", "act"];

export interface ClassifyResult {
  lane: Lane;
  confidence: number;
}

export class LaneClassificationError extends Error {}

export async function classifyLane(
  registry: Registry,
  utterance: string,
  onTrace?: TraceSink,
): Promise<ClassifyResult> {
  const req: ChatRequest = {
    lane: "converse",
    system: LANE_CLASSIFIER_SYSTEM,
    messages: [{ role: "user", content: utterance }],
    jsonSchema: { type: "object" },
    maxTokens: 40,
    temperature: 0,
    // SPEC.md § 9 budgets lane classification at 150ms, assuming a local
    // model — already superseded by DECISIONS.md ADR-001 (no local model
    // viable on this hardware, routed to NIM). A cold connection to a
    // remote host plus generation time can exceed 1.5s even for a fast
    // 8B model (confirmed live: a first call in a fresh process aborted
    // at 1500ms) — 3000ms leaves real margin without threatening
    // `converse`'s own <1.5s user-facing budget once a connection is warm.
    timeoutMs: 3000,
  };

  let text = "";
  for await (const chunk of routeChat(registry, req, onTrace)) {
    text += chunk.delta;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new LaneClassificationError(`classifier returned invalid JSON: ${text.slice(0, 200)}`, { cause });
  }

  const record = parsed as { lane?: unknown; confidence?: unknown };
  const lane = String(record.lane ?? "").trim().toLowerCase();
  if (!VALID_LANES.includes(lane as Lane)) {
    throw new LaneClassificationError(`classifier returned an unknown lane: ${JSON.stringify(parsed)}`);
  }

  return {
    lane: lane as Lane,
    confidence: typeof record.confidence === "number" ? record.confidence : 0.5,
  };
}
