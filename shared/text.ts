/**
 * shared/text.ts — one way to normalize an utterance before matching it.
 *
 * There were **four** copies of this, in `core/skills/socialUtterance.ts`,
 * `core/skills/conversation/cancel.ts`, `core/router/providers/rules.ts`
 * and `skills/_shared/affirmative.ts` -- all same-language (unlike the
 * deliberate `senses/voice/language.py` / `skills/_shared/language.ts`
 * pair, which spans two runtimes and is documented as such). They had
 * already drifted, and the drift was doing real damage:
 *
 * - `cancel.ts` dropped `¿¡` from its punctuation class while its own
 *   comment claimed "same discipline as socialUtterance.ts", so the same
 *   input normalized differently in the two files.
 * - `affirmative.ts` stripped no accents at all and *compensated* by
 *   listing both spellings of every accented word in its word sets
 *   ("não"/"nao", "força"/"forca", "exato"/"exacto") -- so every future
 *   accented word needed two entries or it silently failed.
 * - `rules.ts` stripped accents but not apostrophes or punctuation.
 *
 * All four exist because of the same underlying fact, learned twice the
 * hard way (`core/memory/keywordSearch.ts`, then `providers/rules.ts`):
 * JavaScript's `\w` and `\b` are ASCII-only even with the `u` flag, so
 * accented Portuguese has to be folded before matching or the patterns
 * miss their own literal text.
 *
 * Lives in `shared/` because the callers span `core/router`, `core/skills`
 * and `skills/` -- no one of those may sensibly import from the others.
 */

/**
 * Lowercases, strips diacritics, removes apostrophes, turns punctuation
 * into spaces, and collapses whitespace.
 *
 * Apostrophes are **removed, not spaced**: they sit inside a word, so
 * spacing them turns "how's" into "how s" and "don't" into "don t", which
 * matches nothing. That exact bug was caught by tests twice, in two
 * different copies, before this was unified.
 */
export function normalizeUtterance(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['`´‘’]/g, "")
    .replace(/[.,!?;:¿¡"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
