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
  /** Both languages, always. A reflex answer is the fastest, most
   * frequent thing JARVIS says; answering a Portuguese command in
   * English is exactly the "confidently wrong" failure CLAUDE.md § 6
   * is about, in the most visible possible place. */
  en: (utterance: string) => string;
  pt: (utterance: string) => string;
}

/** Found live 2026-08-17: this provider is the ONLY registered `reflex`
 * provider, and every pattern was English-only -- while the lane
 * classifier's own prompt and `core/router/laneHeuristic.ts` both
 * explicitly route PT-PT phrases here ("para", "que horas são", "diz
 * outra vez", "mais alto", "estás aí", "é tudo", "liga a câmara"). So
 * saying "para" classified as `reflex` correctly, matched nothing here,
 * and fell through to a generic English "Got it." Every Portuguese
 * reflex utterance got a wrong-language answer, contradicting ADR-039's
 * bilingual work everywhere else in the stack. */
/** Accents are stripped before matching, and every pattern below is
 * written unaccented. Two reasons, one of them a bug found while writing
 * these tests: JavaScript's `\b` is defined in terms of `\w`, which is
 * ASCII-only -- so `/\bé tudo\b/` and `/\bestás aí\b/` simply do not
 * match their own literal text, and both silently fell through to the
 * generic fallback. (Exactly the same ASCII-`\w` trap that had broken
 * Portuguese keyword search in `core/memory/keywordSearch.ts`.) It also
 * means real STT output matches whether or not it carried the accents,
 * which it does not always do. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const RULES: Rule[] = [
  {
    pattern: /\b(stop|cancel|never ?mind|pause)\b|^\s*(para|parar|cancela|cancelar|esquece)\s*[.!]?\s*$/i,
    en: () => "Stopped.",
    pt: () => "Parado.",
  },
  {
    pattern: /\bwhat time is it\b|\bque horas sao\b/i,
    en: () => `It's ${formatTime(new Date(), "en")}.`,
    pt: () => `São ${formatTime(new Date(), "pt")}.`,
  },
  {
    pattern: /\b(say that again|repeat)\b|\b(diz outra vez|repete)\b/i,
    en: () => "Repeating.",
    pt: () => "A repetir.",
  },
  { pattern: /\blouder\b|\bmais alto\b/i, en: () => "Turning it up.", pt: () => "A subir o som." },
  { pattern: /\bare you there\b|\bestas ai\b/i, en: () => "I'm here.", pt: () => "Estou aqui." },
  { pattern: /\bthat'?s all\b|\be tudo\b/i, en: () => "Understood.", pt: () => "Entendido." },
  {
    pattern: /\b(turn on the camera|open your eyes)\b|\b(liga a camara|abre os olhos)\b/i,
    en: () => "Camera on.",
    pt: () => "Câmara ligada.",
  },
  {
    pattern: /\bclose the camera\b|\bdesliga a camara\b/i,
    en: () => "Camera off.",
    pt: () => "Câmara desligada.",
  },
];

function formatTime(d: Date, lang: "en" | "pt"): string {
  return lang === "pt"
    ? d.toLocaleTimeString("pt-PT", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Deliberately duplicated from `skills/_shared/language.ts` rather than
 * imported: `core/router` must not depend on `skills/**` (the dependency
 * runs the other way), and this needs far less than that module does --
 * a reflex utterance is a handful of words, and only the *response*
 * language rides on it. Same "boring over DRY" call this project already
 * made for `ConnectionHolder` across the senses daemons. */
const PT_MARKERS =
  /\b(para|parar|cancela|cancelar|esquece|que|horas|sao|diz|outra|vez|repete|mais|alto|estas|ai|tudo|liga|desliga|camara|abre|olhos|faz|isso|la)\b/;

/** Checked on the ORIGINAL text for diacritics (a real signal Portuguese
 * was spoken) and on the normalized text for the word list. */
function isPortuguese(utterance: string): boolean {
  return /[ãõçáéíóúâêôàü]/i.test(utterance) || PT_MARKERS.test(normalize(utterance));
}

/** Exported so `core/main.ts` can answer a reflex-classified utterance
 * directly, with no model call and no network at all -- which is the
 * entire point of this lane (SPEC.md § 3) and was not happening.
 *
 * Found live 2026-08-17: `generalConversationReply` hardcodes
 * `lane: "converse"`, and no skill routes an unmatched utterance
 * anywhere else, so this provider was unreachable on the fallback path.
 * "para" classified as `reflex` correctly and was then answered by a
 * remote model over the network -- the opposite of what the lane
 * exists for, and needless latency on an 8GB machine.
 *
 * Returns `null` when no rule fires, deliberately: the caller must then
 * fall through to real conversation. Answering "Got it." to a genuine
 * question the classifier merely *guessed* was reflex would be worse
 * than the extra round trip. */
export function matchReflex(utterance: string): string | null {
  return match(utterance);
}

function match(utterance: string): string | null {
  const normalized = normalize(utterance);
  const pt = isPortuguese(utterance);
  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) return pt ? rule.pt(utterance) : rule.en(utterance);
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
    // In the owner's own language, though: the generic fallback used to
    // be English unconditionally, which is how a Portuguese "para" ended
    // up answered with "Got it."
    const fallback = lastUser && isPortuguese(lastUser.content) ? "Certo." : "Got it.";
    yield* singleChunk(response ?? fallback);
  }

  async health(): Promise<ProviderHealth> {
    return { ok: true };
  }
}
