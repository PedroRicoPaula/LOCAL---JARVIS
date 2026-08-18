/**
 * core/skills/socialUtterance.ts — a no-model, no-network guard that
 * keeps purely social utterances ("how are you", "obrigado", "olá") out
 * of skill dispatch entirely, so they reach general conversation instead
 * of the least-wrong skill.
 *
 * **Why this exists, measured not assumed (2026-08-17).** Real cosine
 * scores against the full live manifest index showed every social phrase
 * tested clearing `CANDIDATE_FLOOR` (0.5), and two of them clearing
 * `DISPATCH_SCORE` (0.72) outright with a runner-up margin wide enough
 * to skip disambiguation altogether:
 *   - "how are you"    -> brief.morning_brief 0.8303 (auto-dispatched)
 *   - "how's it going" -> brief.morning_brief 0.8542 (auto-dispatched)
 *   - "olá"            -> look.describe       0.6747
 *   - "tudo bem?"      -> look.describe       0.7544
 *   - "obrigado"       -> look.describe       0.7487
 * Asking JARVIS how it was doing produced a full morning briefing;
 * saying thank you nearly opened the camera. A real miss was also found
 * in the owner's own production history ("Como é que tu estás?" ->
 * `about.list_capabilities`, which read back the entire capability list).
 *
 * **Why a heuristic rather than a prompt fix.** `DISAMBIGUATION_SYSTEM`
 * already has a "none" escape hatch and the model still chose a skill.
 * ADR-038 records two separate attempts at fixing this class of problem
 * by rewording that shared prompt: both failed to fix a single case, and
 * one regressed two unrelated, previously-correct cases. `core/router/
 * laneHeuristic.ts` (ADR-040) is this project's own accepted answer to
 * exactly that situation -- a boring, deterministic, no-model check
 * beats a demonstrably-unreliable model judgment on a narrow structured
 * task. This is the same call, applied one stage later in the pipeline.
 *
 * **Whole-utterance matching, never substrings.** "como está o tempo lá
 * fora" (weather) and "como estás" (social) differ only by what follows,
 * so a substring match would silently break a working skill. Every
 * pattern here is anchored `^...$` after normalization, and the guard is
 * verified against a real must-not-match list in its own tests.
 *
 * **Morning greetings are deliberately excluded.** "bom dia" / "good
 * morning" belong to `skills/brief` (measured: "bom dia" -> 1.0000
 * against its own example) and are a real, wanted dispatch, not a social
 * pleasantry to swallow.
 *
 * Side benefit, and a real one on this 8GB machine: a matched utterance
 * skips the lane-classification call, the embedding call, and any
 * disambiguation call -- the whole dispatch pipeline -- so the most
 * common throwaway phrases are also the cheapest and fastest to answer
 * (CLAUDE.md § 7).
 */

/** Lowercase, strip accents, drop surrounding punctuation, collapse
 * whitespace. Accent-stripping matters for real STT output: whisper
 * transcribes PT-PT with accents, but a typed dashboard test-console
 * line often won't have them ("ola", "obrigado"). */
function normalize(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      // Apostrophes are *removed*, not spaced -- they sit inside a word
      // ("how's" -> "hows", "you're" -> "youre"). Replacing them with a
      // space instead produced "how s it going", which matched nothing;
      // caught by this module's own tests before it ever shipped.
      .replace(/['`´‘’]/g, "")
      .replace(/[.,!?;:¿¡"]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Optional leading/trailing address to JARVIS, plus optional politeness,
 * stripped before matching so "hey jarvis how are you" and "como estas
 * jarvis" both reduce to their social core. */
function stripAddress(text: string): string {
  return text
    .replace(/^(hey |ok |olha |escuta )?jarvis\b[ ,]*/i, "")
    .replace(/[ ,]*\bjarvis\s*$/i, "")
    .replace(/\s+(por favor|se faz favor|please)\s*$/i, "")
    .trim();
}

/** Anchored whole-utterance patterns. Each must match the *entire*
 * normalized utterance -- see this module's docstring on why substring
 * matching is unsafe here. */
const SOCIAL_PATTERNS: readonly RegExp[] = [
  // --- English: greetings ---
  /^(hi|hello|hey|yo|heya|hiya)$/,
  /^(hi|hello|hey) there$/,
  // --- English: how-are-you, in its common forms ---
  /^how (are|r) (you|u)( doing| today| feeling)?$/,
  /^how('?s| is) it going$/,
  /^how('?s| is) (your day|everything|things)( going)?$/,
  /^(you|u) (ok|okay|alright|good)$/,
  /^are (you|u) (ok|okay|alright|well)$/,
  /^how (have|ve) (you|u) been$/,
  // --- English: thanks / sign-offs ---
  /^(thanks|thank you|thanks a lot|thank you very much|thanks so much|cheers|ta)$/,
  /^(bye|goodbye|see you|see ya|later|good night|goodnight|night)$/,
  /^(nice|good|great) (to (meet|see) you|talking to you)$/,
  /^(you'?re|youre) (welcome|the best|great|awesome)$/,

  // --- PT-PT: greetings (deliberately NOT "bom dia" -- see docstring) ---
  /^(ola|oi|viva|boas|ei)$/,
  /^(ola|oi|viva|boas) a? ?todos$/,
  // --- PT-PT: how-are-you ---
  /^como (estas|esta|vais|tens estado|te sentes)$/,
  /^como e que (tu )?(estas|esta|vais|tens estado|te sentes)$/,
  /^(tudo bem|tudo bom|tudo certo|esta tudo bem|tudo fixe|tudo tranquilo)$/,
  /^(entao )?(tudo bem|tudo bom|como e que isso vai)$/,
  /^(estas|esta) (bem|tudo bem)$/,
  // --- PT-PT: thanks / sign-offs ---
  /^(obrigado|obrigada|muito obrigado|muito obrigada|obrigadao|valeu)$/,
  /^(adeus|ate logo|ate ja|ate amanha|boa noite|ate a proxima|xau|tchau)$/,
  /^(de nada|na boa|forca|fixe|boa)$/,
  /^(foi um prazer|prazer em conhecer-te|gosto de falar contigo)$/,
];

/**
 * True when the utterance is a pure social pleasantry with no task in
 * it -- a greeting, a how-are-you, a thank-you, a sign-off. Callers
 * should route these to general conversation rather than dispatching a
 * skill.
 *
 * Deliberately conservative: anything carrying a real topic or object
 * ("como está o tempo lá fora", "how's my computer doing", "bom dia, o
 * que se passa hoje") is *not* social by this definition and is left
 * entirely alone for the normal pipeline to route.
 */
export function isSocialUtterance(utterance: string): boolean {
  const core = stripAddress(normalize(utterance));
  if (!core) return false;
  return SOCIAL_PATTERNS.some((p) => p.test(core));
}
