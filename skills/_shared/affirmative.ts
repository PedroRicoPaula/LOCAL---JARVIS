/**
 * skills/_shared/affirmative.ts — reading a spoken yes/no answer, in
 * either language (ADR-033).
 *
 * Deliberately three-valued, not boolean: "yes", "no", and **"I can't
 * tell"** are genuinely different, and collapsing the third into either
 * of the first two is how a confirmation step stops being a
 * confirmation. A caller that can't tell what the owner meant must ask
 * again or do nothing -- never proceed. CLAUDE.md § 6: "If the system
 * does not know, it says so."
 *
 * No model call: this runs on a one-word answer to a question the skill
 * just asked, where a keyword match is both sufficient and instant
 * (CLAUDE.md § 7), and where a model's own failure mode would be
 * confidently guessing "yes" -- the exact wrong direction for a
 * confirmation.
 */

const YES = new Set([
  // English
  "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "please", "do", "go",
  "confirm", "confirmed", "affirmative", "correct", "right", "fine",
  // PT-PT
  "sim", "claro", "certo", "podes", "pode", "faz", "força", "forca", "isso",
  "exato", "exacto", "confirmo", "afirmativo", "vai", "quero", "manda",
]);

const NO = new Set([
  // English
  "no", "nope", "nah", "cancel", "stop", "don't", "dont", "never", "negative",
  "forget", "skip", "leave",
  // PT-PT
  "não", "nao", "nada", "cancela", "cancelar", "para", "deixa", "esquece",
  "negativo", "nem", "nunca",
]);

function normalize(text: string): string {
  return (
    text
      .toLowerCase()
      // Apostrophes are removed, not spaced -- they sit inside a word, so
      // spacing them turns "don't" into "don t" and it matches nothing.
      // (The same slip was caught by tests in `socialUtterance.ts`.)
      .replace(/['`´‘’]/g, "")
      .replace(/[.,!?;:"]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Returns `"yes"`, `"no"`, or `"unclear"` for a spoken answer.
 *
 * Checked as *words*, not substrings -- "no" must not match inside
 * "November", and PT "não" must not match inside "nãozinho". A negation
 * anywhere in the answer wins over an affirmation ("yes, no, cancel
 * that" is a no), because misreading a refusal as consent is the
 * expensive direction of this mistake.
 */
export function readAffirmative(answer: string): "yes" | "no" | "unclear" {
  const words = normalize(answer).split(" ").filter(Boolean);
  if (words.length === 0) return "unclear";

  let sawYes = false;
  for (const w of words) {
    if (NO.has(w)) return "no";
    if (YES.has(w)) sawYes = true;
  }
  return sawYes ? "yes" : "unclear";
}
