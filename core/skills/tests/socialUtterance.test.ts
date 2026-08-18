import assert from "node:assert/strict";
import { test } from "node:test";
import { isSocialUtterance } from "../socialUtterance.ts";

// Every phrase here was either measured live wrongly matching a real
// skill (see socialUtterance.ts's docstring for the cosine scores) or is
// an obvious variant of one that was.
const SOCIAL: readonly string[] = [
  // EN greetings
  "hi",
  "hello",
  "hey",
  "Hey there",
  "hi there",
  // EN how-are-you -- "how are you"/"how's it going" both measured
  // auto-dispatching to brief.morning_brief before this guard existed
  "how are you",
  "How are you?",
  "how are you doing",
  "how are you today",
  "how's it going",
  "hows it going",
  "how is it going",
  "how's your day going",
  "how have you been",
  "are you ok",
  "are you okay",
  "you good",
  // EN thanks / sign-offs
  "thanks",
  "Thank you",
  "thanks a lot",
  "thank you very much",
  "cheers",
  "bye",
  "goodbye",
  "see you",
  "good night",
  "nice to meet you",
  "you're welcome",
  // PT-PT greetings
  "olá",
  "ola",
  "oi",
  "viva",
  "boas",
  // PT-PT how-are-you -- the exact production miss that prompted this
  "Como é que tu estás?",
  "como é que tu estás",
  "como estás",
  "como estas",
  "como vais",
  "como te sentes",
  "tudo bem",
  "tudo bem?",
  "tudo bom",
  "está tudo bem",
  "estás bem",
  // PT-PT thanks / sign-offs
  "obrigado",
  "obrigada",
  "muito obrigado",
  "valeu",
  "adeus",
  "até logo",
  "boa noite",
  "de nada",
];

// The important half of this test. Every one of these is a REAL working
// dispatch today (most have their own case in bench/bench_skill_routing.ts
// or a manifest example) -- if the guard ever swallows one, a working
// skill silently stops being reachable.
const NOT_SOCIAL: readonly string[] = [
  // Morning greetings belong to skills/brief, deliberately excluded --
  // "bom dia" measured 1.0000 against its own manifest example.
  "bom dia",
  "bom dia jarvis",
  "good morning",
  "good morning jarvis",
  "bom dia, o que se passa hoje",
  // Shares a prefix with "como estás" but carries a real topic
  "como está o tempo lá fora",
  "como está o meu computador",
  "como estão as minhas tarefas",
  // Shares "how are"/"how's" but is a real system_health dispatch
  "how's my computer doing",
  "how's the machine running",
  "how are my tasks looking",
  // Real dispatches that merely start politely
  "olá, abre o Spotify",
  "hey jarvis, what's the weather",
  "hi, add milk to the shopping list",
  // "thanks" as part of a real request, not a bare sign-off
  "thanks, now open Cursor",
  "obrigado, agora liga a câmara",
  // Genuinely ambiguous but currently a real brief dispatch -- left alone
  "what's up",
  "catch me up on things",
  // Other real dispatches
  "what can you do",
  "o que consegues fazer",
  "what time is it",
  "que horas são",
  "",
  "   ",
];

test("real social pleasantries are recognized, so they reach general conversation instead of a skill", () => {
  for (const phrase of SOCIAL) {
    assert.equal(isSocialUtterance(phrase), true, `expected social: ${JSON.stringify(phrase)}`);
  }
});

test("real working dispatches are never swallowed -- the guard must not break a reachable skill", () => {
  for (const phrase of NOT_SOCIAL) {
    assert.equal(isSocialUtterance(phrase), false, `expected NOT social: ${JSON.stringify(phrase)}`);
  }
});

test("the address to JARVIS is stripped, so 'hey jarvis how are you' is still social", () => {
  assert.equal(isSocialUtterance("hey jarvis how are you"), true);
  assert.equal(isSocialUtterance("jarvis, how are you?"), true);
  assert.equal(isSocialUtterance("como estás jarvis"), true);
  assert.equal(isSocialUtterance("olá jarvis"), true);
});

test("trailing politeness is stripped, so 'how are you please' is still social", () => {
  assert.equal(isSocialUtterance("how are you please"), true);
  assert.equal(isSocialUtterance("como estás se faz favor"), true);
});

test("accents are optional -- real STT writes them, a typed test-console line often doesn't", () => {
  assert.equal(isSocialUtterance("olá"), isSocialUtterance("ola"));
  assert.equal(isSocialUtterance("como estás"), isSocialUtterance("como estas"));
  assert.equal(isSocialUtterance("até logo"), isSocialUtterance("ate logo"));
});

test("matching is whole-utterance, never a substring -- a social phrase plus a real task is not social", () => {
  assert.equal(isSocialUtterance("how are you"), true);
  assert.equal(isSocialUtterance("how are you, and what's the weather"), false);
  assert.equal(isSocialUtterance("obrigado"), true);
  assert.equal(isSocialUtterance("obrigado, adiciona leite à lista"), false);
});
