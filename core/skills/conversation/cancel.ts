/**
 * core/skills/conversation/cancel.ts — recognising "stop, forget it"
 * while a skill is waiting on `ctx.ask()`.
 *
 * **Why this exists.** `offerUtterance` used to resolve a pending
 * `ask()` with *whatever* the next utterance was, unconditionally. So
 * while `skills/tasks` awaited "What's the task?", the owner saying
 * "stop" produced a real Reminders.app item titled **"stop"** --
 * `REMINDERS` is green-tier, so it ran with no approval to catch it.
 * `skills/launcher` had the same shape (`open -a stop`). The reflex
 * lane's own cancel rules (`core/router/laneHeuristic.ts`,
 * `core/router/providers/rules.ts`) never got a chance to fire, because
 * a pending `ask()` short-circuits dispatch entirely in
 * `core/main.ts` before any lane classification happens.
 *
 * This is `docs/SKILLS.md` § 7's case 5 (`cancel()` mid-interaction),
 * which every affected skill's own test file declared "N/A, single-turn"
 * while in fact calling `ctx.ask` -- the claim was wrong, not the case.
 *
 * Same discipline as `core/skills/socialUtterance.ts`: anchored
 * whole-utterance matching after normalization, never substrings. "stop"
 * cancels; "stop the timer" and "para de seguir as minhas mãos" are real
 * answers and must not. Bilingual per ADR-033.
 */

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['`´‘’]/g, "")
    .replace(/[.,!?;:"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Anchored, whole-utterance only. Kept deliberately short: a false
 * positive here throws away a real answer the owner just gave, so only
 * phrases that are unambiguously a cancellation on their own belong. */
const CANCEL_PATTERNS: readonly RegExp[] = [
  // English
  /^(stop|cancel|cancel that|nevermind|never mind|forget it|forget that|dont bother|do not bother)$/,
  /^(no|nope) (thanks|thank you|nevermind|never mind|forget it)$/,
  // PT-PT
  /^(para|parar|cancela|cancelar|esquece|esquece isso|deixa|deixa estar|deixa la|nao interessa)$/,
  /^(ja nao|nao quero|nao e preciso|nao interessa mais)$/,
];

/** True when the owner is calling off the question they were just asked,
 * rather than answering it. */
export function isCancelUtterance(text: string): boolean {
  const core = normalize(text);
  if (!core) return false;
  return CANCEL_PATTERNS.some((p) => p.test(core));
}

/** Thrown by a pending `ask()` when the owner cancels instead of
 * answering. A distinct class so `core/main.ts` can tell a deliberate
 * cancellation apart from a real failure and say "Cancelled." rather
 * than "Something went wrong." -- CLAUDE.md § 6: reporting a
 * cancellation as an error is its own small dishonesty. */
export class AskCancelledError extends Error {
  constructor() {
    super("the owner cancelled instead of answering");
    this.name = "AskCancelledError";
  }
}
