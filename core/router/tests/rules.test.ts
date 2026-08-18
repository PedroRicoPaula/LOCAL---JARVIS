import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatRequest } from "../../../shared/types.ts";
import { RulesProvider } from "../providers/rules.ts";

const provider = new RulesProvider();

async function ask(utterance: string): Promise<string> {
  const req: ChatRequest = {
    lane: "reflex",
    system: "",
    messages: [{ role: "user", content: utterance }],
    timeoutMs: 300,
  };
  let out = "";
  for await (const chunk of provider.chat(req)) out += chunk.delta;
  return out;
}

test("recognizes stop/cancel phrasing", async () => {
  assert.equal(await ask("stop"), "Stopped.");
  assert.equal(await ask("cancel that"), "Stopped.");
  assert.equal(await ask("never mind"), "Stopped.");
});

test("recognizes camera control phrases (DECISIONS.md ADR-001)", async () => {
  assert.equal(await ask("turn on the camera"), "Camera on.");
  assert.equal(await ask("open your eyes"), "Camera on.");
  assert.equal(await ask("close the camera"), "Camera off.");
});

test("what time is it produces an actual time, not a canned string", async () => {
  const reply = await ask("what time is it");
  assert.match(reply, /^It's \d{1,2}:\d{2}\s?[AP]M\.$/);
});

test("an utterance matching no rule still gets an honest, non-empty reply", async () => {
  const reply = await ask("completely unrelated gibberish xyz");
  assert.equal(reply, "Got it.");
});

test("health is always ok — no external dependency", async () => {
  assert.deepEqual(await provider.health(), { ok: true });
});

// --- bilingual reflex answers (2026-08-17) ---------------------------
// This is the ONLY registered reflex provider, and every pattern was
// English-only -- while the lane classifier's prompt and
// laneHeuristic.ts both explicitly route PT-PT phrases here. So "para"
// classified as reflex correctly, matched nothing, and got a generic
// English "Got it."

// Uses the file's existing `ask` helper -- no second ChatRequest shape
// to keep in sync.
const reply = ask;

test("PT-PT reflex utterances are answered in Portuguese", async () => {
  assert.equal(await reply("para"), "Parado.");
  assert.equal(await reply("cancela"), "Parado.");
  assert.equal(await reply("diz outra vez"), "A repetir.");
  assert.equal(await reply("mais alto"), "A subir o som.");
  assert.equal(await reply("estás aí?"), "Estou aqui.");
  assert.equal(await reply("é tudo"), "Entendido.");
  assert.equal(await reply("liga a câmara"), "Câmara ligada.");
  assert.equal(await reply("desliga a câmara"), "Câmara desligada.");
});

test("English reflex utterances still answer in English -- no regression", async () => {
  assert.equal(await reply("stop"), "Stopped.");
  assert.equal(await reply("say that again"), "Repeating.");
  assert.equal(await reply("louder"), "Turning it up.");
  assert.equal(await reply("are you there"), "I'm here.");
  assert.equal(await reply("that's all"), "Understood.");
  assert.equal(await reply("turn on the camera"), "Camera on.");
  assert.equal(await reply("close the camera"), "Camera off.");
});

test("the time is read back in the language it was asked in", async () => {
  assert.match(await reply("what time is it"), /^It's /);
  assert.match(await reply("que horas são"), /^São /);
});

test("the no-rule-fired fallback follows the language too", async () => {
  assert.equal(await reply("blergh"), "Got it.");
  // Any Portuguese marker is enough -- this is a fallback, not a parse.
  assert.equal(await reply("faz lá isso"), "Certo.");
});

test("an accent-stripped PT utterance (real STT sometimes drops them) still answers in Portuguese", async () => {
  assert.match(await reply("que horas sao"), /^São /);
  assert.equal(await reply("estas ai"), "Estou aqui.");
  assert.equal(await reply("liga a camara"), "Câmara ligada.");
  assert.equal(await reply("e tudo"), "Entendido.");
});
