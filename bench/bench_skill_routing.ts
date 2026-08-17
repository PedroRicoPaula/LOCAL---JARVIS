/**
 * bench/bench_skill_routing.ts — ROADMAP.md Phase 5 DoD: "Intent routing
 * >= 90% across the manifests present." Runs real utterances (paraphrases
 * of and close variants on each registered skill's own manifest
 * examples, plus off-topic utterances that should match nothing) through
 * the real `dispatch()` pipeline: real embeddings (Ollama), real lane
 * classification (NIM, per Phase 3's wiring).
 *
 * Usage: node bench/bench_skill_routing.ts
 *
 * `bench/baseline.json`'s entry for this benchmark is deliberately set
 * lower (88.6) than its typical run (routinely 91%+) -- confirmed live,
 * 2026-08-07: three consecutive same-night runs landed 91.4% / 88.6% /
 * 91.4% with zero code changes between them, entirely attributable to
 * `disambiguate()`'s own LLM-call run-to-run reliability under heavy real
 * API usage (ADR-038), not a regression. A tight baseline here would make
 * `bench/_shared/regressionGate.ts` cry wolf on normal variance; the
 * lower baseline plus its own tolerance still catches a real code
 * regression without flagging this known, already-accepted wobble.
 */

import { openDb } from "../core/memory/db.ts";
import { Memory } from "../core/memory/memory.ts";
import { createGatedFs } from "../core/skills/fs.ts";
import { createEmptyMcpToolLister } from "../core/skills/mcp.ts";
import { OllamaProvider } from "../core/router/providers/ollama.ts";
import { buildRegistry } from "../core/router/wiring.ts";
import { checkGate, formatGateReport, loadBaselines } from "./_shared/regressionGate.ts";
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
  // shopping_list -- real intents, paraphrases of the manifest examples,
  // added 2026-08-06 alongside the fact-statement cases below so a
  // DISAMBIGUATION_SYSTEM prompt fix can be checked for regressions on
  // the skill it's actually meant to keep working, not just on what it's
  // meant to now refuse (ADR-038).
  { utterance: "can you add cheese to the shopping list", expected: { skillId: "shopping_list", intentId: "add_item" } },
  { utterance: "we're almost out of rice", expected: { skillId: "shopping_list", intentId: "add_item" } },
  { utterance: "what's still on the shopping list", expected: { skillId: "shopping_list", intentId: "list_items" } },
  { utterance: "take the rice off the shopping list, I bought it", expected: { skillId: "shopping_list", intentId: "remove_item" } },
  { utterance: "clear out the whole shopping list", expected: { skillId: "shopping_list", intentId: "clear_list" } },
  // fact/preference statements about the owner -- should never dispatch
  // to shopping_list (or anywhere else); real bug found live 2026-08-04
  // (ADR-034), root-caused 2026-08-06 (docs/BACKLOG.md): the model's
  // disambiguation step chose shopping_list.remove_item for a dietary
  // fact instead of saying "none". "Peanuts"/"lactose" are the two
  // phrasings actually seen live; the other two check the fix
  // generalizes past diet specifically, not just those two words.
  { utterance: "I don't eat peanuts, I'm allergic", expected: "none" },
  { utterance: "I'm lactose intolerant", expected: "none" },
  { utterance: "I hate mushrooms, always have", expected: "none" },
  { utterance: "my favorite fruit is mango", expected: "none" },
  // PT-PT dispatch -- added 2026-08-06 (ADR-033/ADR-039) alongside PT
  // examples in every skill's manifest. Real paraphrases, not the
  // manifest's own literal example strings, same standard as the
  // English cases above -- proves the whole pipeline (lane + embedding
  // match + disambiguation), not just that a memorized string echoes.
  { utterance: "bom dia, o que se passa hoje", expected: { skillId: "brief", intentId: "morning_brief" } },
  { utterance: "falta-nos leite, põe na lista", expected: { skillId: "shopping_list", intentId: "add_item" } },
  { utterance: "já usei o leite, tira da lista", expected: { skillId: "shopping_list", intentId: "remove_item" } },
  { utterance: "como está o tempo lá fora", expected: { skillId: "weather", intentId: "current_weather" } },
  { utterance: "lembra-me de pagar a renda amanhã", expected: { skillId: "tasks", intentId: "add_task" } },
  { utterance: "abre o Cursor se faz favor", expected: { skillId: "launcher", intentId: "open_app" } },
  // clipboard -- added 2026-08-06 (docs/BACKLOG.md Tier 1)
  { utterance: "what did I just copy", expected: { skillId: "clipboard", intentId: "read_clipboard" } },
  { utterance: "put this on my clipboard: call the plumber", expected: { skillId: "clipboard", intentId: "write_clipboard" } },
  { utterance: "grab a screenshot of this for me", expected: { skillId: "clipboard", intentId: "capture_screenshot" } },
  { utterance: "turn on do not disturb for me", expected: { skillId: "media", intentId: "set_focus_mode" } },
  { utterance: "desliga o não incomodar", expected: { skillId: "media", intentId: "set_focus_mode" } },
  // system_health / gmail / github / about / look -- added 2026-08-17,
  // closing a real coverage gap: these 5 of 13 registered skills had zero
  // cases here despite being live-integrated, found during a broad smoke
  // test this session. Real paraphrases, not the manifest's own literal
  // example strings, same standard as every other block above.
  { utterance: "is my computer running okay", expected: { skillId: "system_health", intentId: "check_system" } },
  { utterance: "how much cpu am I using right now", expected: { skillId: "system_health", intentId: "check_system" } },
  { utterance: "quanto espaço livre é que tenho no disco", expected: { skillId: "system_health", intentId: "check_system" } },
  { utterance: "anything new in my inbox", expected: { skillId: "gmail", intentId: "check_email" } },
  { utterance: "check if Maria emailed me about the trip", expected: { skillId: "gmail", intentId: "check_email" } },
  { utterance: "tenho algum email da faculdade", expected: { skillId: "gmail", intentId: "check_email" } },
  { utterance: "what projects do I have on github", expected: { skillId: "github", intentId: "list_repos" } },
  { utterance: "pull up my github repos", expected: { skillId: "github", intentId: "list_repos" } },
  { utterance: "what are you able to do for me", expected: { skillId: "about", intentId: "list_capabilities" } },
  { utterance: "walk me through your own features", expected: { skillId: "about", intentId: "list_capabilities" } },
  { utterance: "o que sabes fazer por mim", expected: { skillId: "about", intentId: "list_capabilities" } },
  { utterance: "can you turn the camera on for me", expected: { skillId: "look", intentId: "open_camera" } },
  { utterance: "what am I looking at right now", expected: { skillId: "look", intentId: "describe" } },
  { utterance: "start following my hands", expected: { skillId: "look", intentId: "start_gestures" } },
  { utterance: "ativa o rastreio de mãos", expected: { skillId: "look", intentId: "start_gestures" } },
  { utterance: "let my hand drive the mouse", expected: { skillId: "look", intentId: "start_pointer_control" } },
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
    mcp: createEmptyMcpToolLister(),
    fs: createGatedFs([]),
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
  const gate = checkGate("bench_skill_routing", accPct, 90, loadBaselines());
  console.log(`\n  intent routing accuracy  ${accPct.toFixed(1)}%   (need >= 90)`);
  console.log(formatGateReport("bench_skill_routing", gate));
  if (failures.length > 0) {
    console.log(`\n  failures:`);
    for (const f of failures) console.log(`    - ${f}`);
  }

  return gate.passed ? 0 : 1;
}

main().then((code) => process.exit(code));
