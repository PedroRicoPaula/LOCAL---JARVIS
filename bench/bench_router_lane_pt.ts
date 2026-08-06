/**
 * bench/bench_router_lane_pt.ts — ADR-033's bilingual reversal raises a
 * real question `bench_router_lane.ts` never had to answer: the lane
 * classifier's own system prompt is English by design (CLAUDE.md § 4 --
 * internal prompts stay English regardless of the owner's spoken
 * language), so does it still classify correctly when the *utterance*
 * itself is Portuguese, not just accented proper nouns inside an English
 * sentence?
 *
 * Same 45 cases as `bench_router_lane.ts`, same expected lanes, natural
 * PT-PT phrasing (not machine-translated word-for-word) -- the way the
 * owner would actually say each one, matching docs/SKILLS.md § 3's own
 * "write examples the way the owner actually speaks" rule applied here
 * to a benchmark instead of a manifest.
 *
 * Usage: node bench/bench_router_lane_pt.ts
 */

import { classifyLane } from "../core/router/laneClassifier.ts";
import { buildRegistry } from "../core/router/wiring.ts";

const PACE_MS = 2000;

const CASES: readonly [string, string][] = [
  // reflex
  ["para", "reflex"],
  ["cancela isso", "reflex"],
  ["que horas são", "reflex"],
  ["diz outra vez", "reflex"],
  ["deixa estar", "reflex"],
  ["mais alto", "reflex"],
  ["estás aí", "reflex"],
  ["pausa", "reflex"],
  ["liga a câmara", "reflex"],
  ["desliga a câmara", "reflex"],
  ["abre os olhos", "reflex"],
  ["é tudo", "reflex"],
  // converse
  ["bom dia", "converse"],
  ["o que é que eu te perguntei ontem", "converse"],
  ["quantas refeições registei esta semana", "converse"],
  ["lembra-me o que decidimos sobre a base de dados", "converse"],
  ["o que está na minha lista", "converse"],
  ["resume o que acabaste de dizer", "converse"],
  ["obrigado, ajudou imenso", "converse"],
  ["no que é que eu tenho andado a trabalhar", "converse"],
  ["regista uma refeição, acabei de comer", "converse"],
  // reason
  ["porque é que a app do meu clube de hóquei em patins está lenta no telemóvel", "reason"],
  ["explica-me como funciona uma resistência pull-up", "reason"],
  ["devo usar SQLite ou Postgres para isto", "reason"],
  ["ajuda-me a planear a semana à volta dos dois prazos de clientes", "reason"],
  ["qual é um preço razoável para um SaaS de gestão de clubes em Portugal", "reason"],
  ["é seguro alimentar este servo a partir do pino 5V do Arduino", "reason"],
  ["ensina-me como as container queries do CSS diferem das media queries", "reason"],
  ["o que estou a fazer mal com o meu horário de sono", "reason"],
  ["compara o Stripe e o Mollie para um SaaS europeu", "reason"],
  ["como devo estruturar o onboarding para um teste grátis", "reason"],
  // see
  ["olha para isto", "see"],
  ["o que é que eu tenho na mão", "see"],
  ["esta camisa combina com estas calças", "see"],
  ["verifica a minha cablagem", "see"],
  ["aqui está o meu almoço, ajuda-me a registá-lo", "see"],
  ["lê-me este rótulo", "see"],
  ["esta resistência é a certa", "see"],
  ["o que está no ecrã à minha frente", "see"],
  // act
  ["corrige o bug do login no hoqueimanager", "act"],
  ["cria um novo branch chamado experiment", "act"],
  ["corre os testes", "act"],
  ["adiciona um botão de modo escuro à página de definições", "act"],
  ["faz commit do que acabámos de mudar", "act"],
  ["muda o nome desse ficheiro para cortar.py", "act"],
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<number> {
  const registry = await buildRegistry();

  let correct = 0;
  const failures: string[] = [];

  for (let i = 0; i < CASES.length; i++) {
    const [prompt, expected] = CASES[i]!;
    if (i > 0) await sleep(PACE_MS);

    const start = performance.now();
    try {
      const result = await classifyLane(registry, prompt);
      const ms = performance.now() - start;
      if (result.lane === expected) {
        correct += 1;
        console.log(`  [${String(i + 1).padStart(2)}/${CASES.length}] ${ms.toFixed(0).padStart(6)}ms  ok   ${result.lane}`);
      } else {
        failures.push(`${JSON.stringify(prompt)}: expected ${expected}, got ${result.lane}`);
        console.log(
          `  [${String(i + 1).padStart(2)}/${CASES.length}] ${ms.toFixed(0).padStart(6)}ms  MISS ${result.lane} (want ${expected})`,
        );
      }
    } catch (err) {
      failures.push(`${JSON.stringify(prompt)}: ${String(err)}`);
      console.log(`  [${String(i + 1).padStart(2)}/${CASES.length}] ERROR ${String(err)}`);
    }
  }

  const accPct = (100 * correct) / CASES.length;
  console.log(`\n  PT-PT lane accuracy  ${accPct.toFixed(1)}%   (need >= 85, matching bench_router_lane.ts's own bar)`);
  console.log(`\n  ${accPct >= 85 ? "PASS" : "FAIL"}`);

  if (failures.length > 0) {
    console.log(`\n  failures (${failures.length}):`);
    for (const f of failures.slice(0, 12)) console.log(`    - ${f}`);
    if (failures.length > 12) console.log(`    ... and ${failures.length - 12} more`);
  }

  return accPct >= 85 ? 0 : 1;
}

main().then((code) => process.exit(code));
