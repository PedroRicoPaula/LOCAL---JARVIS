/**
 * bench/bench_disambiguation_fallback.ts — reproduces and verifies the fix
 * for the "peanuts" bug (docs/BACKLOG.md, root-caused 2026-08-06, fixed
 * ADR-038): a fact/preference statement about the owner ("I don't eat
 * peanuts, I'm allergic") got dispatched to `shopping_list.remove_item`
 * instead of "none".
 *
 * `bench_skill_routing.ts` (the general routing benchmark) cannot
 * reproduce this on its own -- against the healthy primary model
 * (`nim`), disambiguation already says "none" correctly. The real bug
 * only shows up when disambiguation falls back to the degraded local
 * model (`qwen2.5:0.5b`, ADR-001/ADR-028), which is what actually
 * happens whenever NIM is unreachable. This script forces exactly that
 * path -- a `Registry` with *only* the ollama fallback provider
 * registered for `converse` (the lane both lane-classification and
 * disambiguation run on) -- so the real weak model, not a healthy one,
 * is what gets graded.
 *
 * Usage: node bench/bench_disambiguation_fallback.ts
 * Needs: `ollama pull qwen2.5:0.5b` and `ollama pull mxbai-embed-large`
 * (same requirement as any other bench script using local embeddings).
 */

import { openDb } from "../core/memory/db.ts";
import { Memory } from "../core/memory/memory.ts";
import { createEmptyMcpToolLister } from "../core/skills/mcp.ts";
import { OllamaProvider } from "../core/router/providers/ollama.ts";
import { CONVERSE_OLLAMA_FALLBACK_MODEL } from "../core/router/wiring.ts";
import { Registry } from "../core/router/registry.ts";
import { SkillRegistry } from "../core/skills/registry.ts";
import { createSkillStore } from "../core/skills/store.ts";
import type { SkillContext } from "../core/skills/types.ts";

interface Case {
  utterance: string;
  expected: { skillId: string; intentId: string } | "none";
}

const CASES: Case[] = [
  // The two real phrasings from the live conversation log (ADR-034/
  // docs/BACKLOG.md).
  { utterance: "I don't eat peanuts, I'm allergic", expected: "none" },
  { utterance: "I'm lactose intolerant", expected: "none" },
  // Generalization checks -- not diet-specific, not shopping-adjacent
  // vocabulary at all, to make sure the fix is a real "this is a fact,
  // not a list action" distinction and not an overfit on food words.
  { utterance: "I hate mushrooms, always have", expected: "none" },
  { utterance: "my favorite fruit is mango", expected: "none" },
  { utterance: "I'm allergic to cats", expected: "none" },
  // Real shopping_list intents, unchanged -- regression coverage so the
  // fix doesn't just make the model say "none" to everything.
  { utterance: "add cheese to the shopping list", expected: { skillId: "shopping_list", intentId: "add_item" } },
  { utterance: "take milk off the shopping list", expected: { skillId: "shopping_list", intentId: "remove_item" } },
];

async function main(): Promise<number> {
  const embedder = new OllamaProvider({ models: {}, embedModel: "mxbai-embed-large" });

  // The whole point: only the degraded local fallback is registered, on
  // purpose, for both lanes it's used on in real degraded operation.
  const routerRegistry = new Registry();
  const ollama = new OllamaProvider({ models: { converse: CONVERSE_OLLAMA_FALLBACK_MODEL } });
  routerRegistry.register(ollama, ["converse"]);

  // Warm the model up first, with a generous timeout, before grading
  // anything -- found live 2026-08-06: cold, this machine's 8GB RAM
  // (ADR-001) takes ~30s just to *load* qwen2.5:0.5b, blowing well past
  // the 3s timeout `disambiguate()`/`classifyLane()` actually use in
  // production and throwing `AllProvidersFailedError` instead of
  // returning a real (if wrong) answer. A real degraded-mode
  // conversation only pays that cold-load cost once, on the first
  // utterance after NIM starts failing -- not on every single one -- so
  // warming up here grades the prompt fix against what the model
  // actually answers, not against how long it took to wake up.
  console.log("warming up the local model (can take ~30s on this machine)...");
  for await (const _ of ollama.chat({
    lane: "converse",
    system: "You respond with one word.",
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 5,
    temperature: 0,
    timeoutMs: 45000,
  })) {
    // discard -- this call exists only to force the model into memory
  }
  console.log("warm.");

  const skillRegistry = new SkillRegistry();
  const db = openDb(":memory:");
  const buildInitCtx = (skillId: string) => ({
    memory: undefined as never,
    store: createSkillStore(db, skillId),
    log: { info() {}, warn() {}, error() {} },
  });
  const loadReport = await skillRegistry.loadAll(buildInitCtx, embedder);
  console.log("loaded:", loadReport.loaded, "disabled:", loadReport.disabled);

  const memory = new Memory(db, embedder);
  const buildContext = (): SkillContext => ({
    router: { complete: async () => "", see: async () => { throw new Error("not used"); } },
    memory,
    camera: { state: "idle", async open() { throw new Error("not used"); } },
    propose: async () => ({ ok: false, reason: "rejected" }),
    say: () => {},
    ask: async () => "",
    store: { exec: () => {}, get: () => undefined, all: () => [], run: () => {} },
    sessionId: "bench",
    now: () => 0,
    log: { info() {}, warn() {}, error() {} },
    mcp: createEmptyMcpToolLister(),
  });

  let correct = 0;
  const failures: string[] = [];

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i]!;
    // A short pace between cases -- back-to-back local Ollama calls on
    // this machine intermittently hit the 3s per-call timeout (observed
    // live, 2026-08-06), most likely Ollama swapping the embed model and
    // the chat model in and out of memory between calls. Unlike
    // `bench_router_lane.ts`'s pacing (which exists for NIM's rate
    // limit), this is about giving a single local model time to load,
    // not a remote quota.
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 500));
    const { outcome, trace } = await skillRegistry.dispatch(embedder, routerRegistry, c.utterance, "bench", () => buildContext());
    const got = trace.chosen ? { skillId: trace.chosen.skillId, intentId: trace.chosen.intentId } : "none";
    const gotStr = got === "none" ? "none" : `${got.skillId}.${got.intentId}`;
    const wantStr = c.expected === "none" ? "none" : `${c.expected.skillId}.${c.expected.intentId}`;
    const ok = gotStr === wantStr;

    if (ok) correct++;
    else {
      failures.push(
        `"${c.utterance}": want ${wantStr}, got ${gotStr} (outcome: ${outcome.outcome}, disambiguated: ${trace.disambiguated}, top score: ${trace.candidates[0]?.score.toFixed(3) ?? "n/a"})`,
      );
    }
    console.log(`  ${ok ? "ok  " : "MISS"} want=${wantStr.padEnd(28)} got=${gotStr.padEnd(28)} "${c.utterance}"`);
  }

  const accPct = (100 * correct) / CASES.length;
  console.log(`\n  degraded-model disambiguation accuracy  ${accPct.toFixed(1)}%   (need 100 -- every case here is a real live/reported bug or its direct regression guard)`);
  console.log(`  ${accPct === 100 ? "PASS" : "FAIL"}`);
  if (failures.length > 0) {
    console.log(`\n  failures:`);
    for (const f of failures) console.log(`    - ${f}`);
  }

  return accPct === 100 ? 0 : 1;
}

main().then((code) => process.exit(code));
