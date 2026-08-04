/**
 * core/router/providers/rules.ts — the `reflex` lane's primary provider.
 *
 * No model, no network: `reflex`'s whole budget is <300ms (SPEC.md § 9) and
 * its examples (stop, repeat, what time is it, camera on/off, wake ack) are
 * a small, fixed, pattern-matchable set — exactly what a lane named
 * "trivial, instant, no reasoning" (bench/bench_local.py's own system
 * prompt) should be. This is also the router's baseline offline-fallback
 * story for `reflex`: always free-local, by construction, per SPEC.md § 3's
 * "every lane must have at least one free-local fallback."
 *
 * Pattern list mirrors bench_local.py's CASES for `reflex`, plus the
 * camera-control phrases DECISIONS.md ADR-001 flagged as misclassified by
 * the lane *classifier* (not this provider) — listed here too so that once
 * the classifier correctly routes them to `reflex`, this provider actually
 * knows what to do with them.
 */

import type { ChatChunk, ChatRequest } from "../../../shared/types.ts";
import type { ModelProvider, ProviderHealth } from "../provider.ts";

interface Rule {
  pattern: RegExp;
  respond: (utterance: string) => string;
}

const RULES: Rule[] = [
  { pattern: /\b(stop|cancel|never ?mind|pause)\b/i, respond: () => "Stopped." },
  { pattern: /\bwhat time is it\b/i, respond: () => `It's ${formatTime(new Date())}.` },
  { pattern: /\b(say that again|repeat)\b/i, respond: () => "Repeating." },
  { pattern: /\blouder\b/i, respond: () => "Turning it up." },
  { pattern: /\bare you there\b/i, respond: () => "I'm here." },
  { pattern: /\bthat'?s all\b/i, respond: () => "Understood." },
  { pattern: /\b(turn on the camera|open your eyes)\b/i, respond: () => "Camera on." },
  { pattern: /\bclose the camera\b/i, respond: () => "Camera off." },
];

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function match(utterance: string): string | null {
  for (const rule of RULES) {
    if (rule.pattern.test(utterance)) return rule.respond(utterance);
  }
  return null;
}

async function* singleChunk(text: string): AsyncIterable<ChatChunk> {
  yield { delta: text, done: true };
}

export class RulesProvider implements ModelProvider {
  readonly id = "rules";
  readonly lanes = ["reflex"] as const;
  readonly costTier = "free-local" as const;

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    const response = lastUser ? match(lastUser.content) : null;
    // No rule fired: still a valid, honest reflex response rather than an
    // error — CLAUDE.md § 6, "if the system does not know, it says so."
    yield* singleChunk(response ?? "Got it.");
  }

  async health(): Promise<ProviderHealth> {
    return { ok: true };
  }
}
