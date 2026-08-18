/**
 * skills/_shared/language.ts — which language the owner just spoke, for
 * skills that answer with fixed template text rather than a model call.
 *
 * **Why this exists.** ADR-033 made the spoken deliverable bilingual
 * (PT-PT + English, matching whatever the owner just said). A skill that
 * routes its answer through a model gets that for free via
 * `core/persona.md`. A skill that answers from a hand-written string --
 * `skills/about`, deliberately, so it can never invent a capability --
 * does not: found live 2026-08-17, asking "o que consegues fazer?" in
 * Portuguese returned the full English capability list.
 *
 * **A deliberate port of `senses/voice/language.py`, not a shared
 * module.** That one picks the TTS *voice* for a finished reply; this
 * one picks which template a skill *composes*. Same scoring, same word
 * lists, different side of the pipeline and different runtime (Python
 * vs TypeScript), with no import path between them. This project has
 * already made that call explicitly for `ConnectionHolder` across the
 * `senses/*` daemons: keep each side independently readable rather than
 * inventing a cross-runtime shared module for a few dozen lines
 * (CLAUDE.md § 3, "prefer boring"). If the two ever disagree in a way
 * that matters, the fix is to update both, and this comment is how the
 * next person finds the other one.
 */

// A diacritic is real evidence of Portuguese but not decisive alone -- a
// single Portuguese proper noun inside an otherwise-English sentence
// shouldn't flip the whole answer. Counted as one point, same weight as
// one stopword match. Verbatim from the Python original's reasoning.
const PT_DIACRITICS = /[ãõçáéíóúâêô]/gi;

const PT_WORDS = new Set([
  "que", "nao", "não", "para", "com", "isso", "voce", "você", "esta", "está",
  "são", "sao", "muito", "obrigado", "obrigada", "onde", "quando", "como",
  "porque", "sim", "mais", "menos", "hoje", "amanha", "amanhã", "ontem",
  "tudo", "nada", "aqui", "ali", "uma", "um", "uns", "umas", "meu", "minha",
  "teu", "tua", "seu", "sua", "isto", "aquilo", "ja", "já", "pode", "podes",
  "fazer", "vou", "vais", "esse", "essa", "depois", "agora", "ainda",
  // Added beyond the Python list: these appear in the real utterances
  // that reach a *skill* (a command), where the Python list only ever
  // sees JARVIS's own finished replies. "consegues" is the exact word
  // from the live miss that prompted this file.
  "consegues", "és", "es", "tens", "queres", "diz", "mostra", "abre", "liga",
]);

const EN_WORDS = new Set([
  "the", "and", "you", "your", "what", "when", "where", "why", "how",
  "yes", "please", "thanks", "today", "tomorrow", "yesterday", "this",
  "that", "here", "there", "is", "are", "was", "were", "to", "for", "a",
  "an", "i'm", "im", "it's", "its", "of", "in", "on", "at", "be", "do",
  "does", "did", "have", "has", "will", "would", "can", "could", "should",
  "not", "no", "with", "next", "week", "fine", "good",
]);

const WORD = /[a-zà-ÿ']+/gi;

/**
 * Returns "pt" or "en". Defaults to "en" unless Portuguese evidence
 * strictly outweighs English -- the safer default, matching the Python
 * original: the owner's primary language for commands and code stays
 * English (CLAUDE.md § 0.1), and one incidental Portuguese word (a name,
 * a place) shouldn't be enough to flip a whole answer.
 */
export function detectLanguage(text: string): "pt" | "en" {
  const words = new Set((text.match(WORD) ?? []).map((w) => w.toLowerCase()));
  let ptScore = (text.match(PT_DIACRITICS) ?? []).length;
  for (const w of words) if (PT_WORDS.has(w)) ptScore++;
  let enScore = 0;
  for (const w of words) if (EN_WORDS.has(w)) enScore++;
  return ptScore > enScore ? "pt" : "en";
}
