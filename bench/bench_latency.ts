/**
 * bench/bench_latency.ts — CLAUDE.md § 7's own budget, finally measured:
 * "The `converse` lane has a hard budget: first audible syllable within
 * 1.5s of the owner finishing speaking."
 *
 * That rule has been in CLAUDE.md since v0.1 and nothing has ever
 * measured it (checked 2026-08-17: no latency benchmark existed). § 7
 * also says, emphatically, "Never `await` a full model response before
 * starting playback... If you build it synchronously 'for now', it will
 * never be fixed." So this measures both halves and reports them
 * separately:
 *
 *   - **time to first chunk** — what the budget is actually about. This
 *     is when TTS *could* start speaking, if the reply is streamed.
 *   - **time to full response** — when a non-streaming implementation
 *     would start speaking instead. The gap between the two is the
 *     latency a synchronous `await` costs the owner, per turn.
 *
 * Real network, real models, real `Registry` wiring -- deliberately not
 * part of `make check` (CLAUDE.md § 3: tests pass with no network),
 * same as every other `bench/` script.
 *
 * Usage: node bench/bench_latency.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { routeChat } from "../core/router/router.ts";
import { buildRegistry } from "../core/router/wiring.ts";
import { checkGate, formatGateReport, loadBaselines } from "./_shared/regressionGate.ts";

const PERSONA_PATH = fileURLToPath(new URL("../core/persona.md", import.meta.url));

/** The budget from CLAUDE.md § 7, in milliseconds. */
const BUDGET_MS = 1500;

/** Real things the owner actually says that fall through to general
 * conversation (no skill claims them) -- the exact path this budget
 * governs. Mixed EN/PT-PT, matching ADR-033's bilingual deliverable. */
const UTTERANCES: readonly string[] = [
  "what do you think about learning electronics",
  "tell me something interesting",
  "explica-me o que é um condensador",
  "o que achas de aprender a programar em rust",
  "why is the sky blue",
];

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx]!;
}

async function main(): Promise<number> {
  const registry = await buildRegistry();
  const persona = readFileSync(PERSONA_PATH, "utf8");
  const system = `${persona}\n\n---\n\nSkills actually loaded right now: weather, tasks, shopping_list. Nothing else.\n\n---\n\nRelevant memory (may be empty):\n(nothing relevant)`;

  const firstChunkMs: number[] = [];
  const fullMs: number[] = [];

  for (const utterance of UTTERANCES) {
    const started = performance.now();
    let firstAt: number | null = null;
    let text = "";

    for await (const chunk of routeChat(registry, {
      lane: "converse",
      system,
      messages: [{ role: "user", content: utterance }],
      temperature: 0,
      timeoutMs: 3000,
    })) {
      // A provider can legitimately emit an empty keep-alive delta; the
      // budget is about the first chunk the owner could actually *hear*,
      // so only a non-empty one counts as "first audible".
      if (firstAt === null && chunk.delta.trim() !== "") firstAt = performance.now();
      text += chunk.delta;
    }

    const doneAt = performance.now();
    const first = (firstAt ?? doneAt) - started;
    const full = doneAt - started;
    firstChunkMs.push(first);
    fullMs.push(full);

    const flag = first <= BUDGET_MS ? "ok  " : "OVER";
    console.log(
      `  ${flag} first ${first.toFixed(0).padStart(5)}ms   full ${full.toFixed(0).padStart(5)}ms   ` +
        `(+${(full - first).toFixed(0)}ms if awaited)   "${utterance.slice(0, 44)}"`,
    );
    if (text.trim() === "") console.log("       WARNING: empty reply -- provider may have failed, timing is not meaningful");
  }

  const sortedFirst = [...firstChunkMs].sort((a, b) => a - b);
  const sortedFull = [...fullMs].sort((a, b) => a - b);
  const p50First = percentile(sortedFirst, 50);
  const p95First = percentile(sortedFirst, 95);
  const p50Full = percentile(sortedFull, 50);
  const withinBudget = firstChunkMs.filter((m) => m <= BUDGET_MS).length;
  const pctWithin = (100 * withinBudget) / firstChunkMs.length;

  console.log(`\n  first chunk   p50 ${p50First.toFixed(0)}ms   p95 ${p95First.toFixed(0)}ms   (budget ${BUDGET_MS}ms)`);
  console.log(`  full response p50 ${p50Full.toFixed(0)}ms`);
  console.log(`  cost of awaiting the full response instead of streaming: +${(p50Full - p50First).toFixed(0)}ms per turn at p50`);
  console.log(`  within budget ${withinBudget}/${firstChunkMs.length}  (${pctWithin.toFixed(1)}%)`);

  const gate = checkGate("bench_latency_within_budget_pct", pctWithin, 80, loadBaselines());
  console.log(formatGateReport("bench_latency_within_budget_pct", gate));
  return gate.passed ? 0 : 1;
}

main().then((code) => process.exit(code));
