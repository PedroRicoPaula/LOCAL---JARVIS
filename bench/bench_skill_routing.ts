/**
 * bench/bench_skill_routing.ts — ROADMAP.md Phase 5 DoD: "Intent routing
 * >= 90% across the manifests present." Runs real utterances (paraphrases
 * of and close variants on each registered skill's own manifest
 * examples, plus off-topic utterances that should match nothing) through
 * the real `dispatch()` pipeline: real embeddings (Ollama), real lane
 * classification (NIM, per Phase 3's wiring).
 *
 * Usage: node bench/bench_skill_routing.ts
 */

import { openDb } from "../core/memory/db.ts";
import { Memory } from "../core/memory/memory.ts";
import { OllamaProvider } from "../core/router/providers/ollama.ts";
import { buildRegistry } from "../core/router/wiring.ts";
import { SkillRegistry } from "../core/skills/registry.ts";
import { createSkillStore } from "../core/skills/store.ts";
import type { SkillContext } from "../core/skills/types.ts";

interface Case {
  utterance: string;
  expected: { skillId: string; intentId: string } | "none";
}

const CASES: Case[] = [
  // brief.morning_brief -- paraphrases, not the literal manifest examples
  { utterance: "morning, what's new", expected: { skillId: "brief", intentId: "morning_brief" } },
  { utterance: "let me know what's going on with things", expected: { skillId: "brief", intentId: "morning_brief" } },
  { utterance: "what should I know before I start my day", expected: { skillId: "brief", intentId: "morning_brief" } },
  { utterance: "catch me up on things", expected: { skillId: "brief", intentId: "morning_brief" } },
  { utterance: "hey, what's the latest", expected: { skillId: "brief", intentId: "morning_brief" } },
  { utterance: "good morning jarvis", expected: { skillId: "brief", intentId: "morning_brief" } },
  // wardrobe.wardrobe_default -- paraphrases
  { utterance: "what should I put on today", expected: { skillId: "wardrobe", intentId: "wardrobe_default" } },
  { utterance: "do these clothes go together", expected: { skillId: "wardrobe", intentId: "wardrobe_default" } },
  { utterance: "help me choose something to wear", expected: { skillId: "wardrobe", intentId: "wardrobe_default" } },
  { utterance: "does this outfit look right", expected: { skillId: "wardrobe", intentId: "wardrobe_default" } },
  // off-topic -- should match nothing
  { utterance: "what's the capital of France", expected: "none" },
  { utterance: "how do I center a div in CSS", expected: "none" },
  { utterance: "commit the current changes", expected: "none" },
  { utterance: "is it going to rain tomorrow", expected: "none" },
  { utterance: "run the test suite", expected: "none" },
];

async function main(): Promise<number> {
  const embedder = new OllamaProvider({ models: {}, embedModel: "mxbai-embed-large" });
  const routerRegistry = await buildRegistry();
  const skillRegistry = new SkillRegistry();
  const db = openDb(":memory:");
  // A per-skill store, not a shared undefined -- tasks/shopping_list's
  // init() creates its own table, same real path core/main.ts uses.
  const buildInitCtx = (skillId: string) => ({
    memory: undefined as never,
    store: createSkillStore(db, skillId),
    log: { info() {}, warn() {}, error() {} },
  });
  const loadReport = await skillRegistry.loadAll(buildInitCtx, embedder);
  console.log("loaded:", loadReport.loaded, "disabled:", loadReport.disabled);

  // Real (empty) Memory -- any confidently-routed skill actually runs
  // handle() for real, and brief's would otherwise crash on undefined.
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
  });

  let correct = 0;
  const failures: string[] = [];

  for (const c of CASES) {
    const { outcome, trace } = await skillRegistry.dispatch(embedder, routerRegistry, c.utterance, "bench", () => buildContext());
    const got = trace.chosen ? { skillId: trace.chosen.skillId, intentId: trace.chosen.intentId } : "none";
    const gotStr = got === "none" ? "none" : `${got.skillId}.${got.intentId}`;
    const wantStr = c.expected === "none" ? "none" : `${c.expected.skillId}.${c.expected.intentId}`;
    const ok = gotStr === wantStr;

    if (ok) correct++;
    else failures.push(`"${c.utterance}": want ${wantStr}, got ${gotStr} (outcome: ${outcome.outcome}, top score: ${trace.candidates[0]?.score.toFixed(3) ?? "n/a"})`);

    console.log(`  ${ok ? "ok  " : "MISS"} want=${wantStr.padEnd(28)} got=${gotStr.padEnd(28)} "${c.utterance}"`);
  }

  const accPct = (100 * correct) / CASES.length;
  console.log(`\n  intent routing accuracy  ${accPct.toFixed(1)}%   (need >= 90)`);
  console.log(`  ${accPct >= 90 ? "PASS" : "FAIL"}`);
  if (failures.length > 0) {
    console.log(`\n  failures:`);
    for (const f of failures) console.log(`    - ${f}`);
  }

  return accPct >= 90 ? 0 : 1;
}

main().then((code) => process.exit(code));
