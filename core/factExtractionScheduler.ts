/**
 * core/factExtractionScheduler.ts — batches fact extraction across an
 * idle window instead of running it once per utterance. `docs/BACKLOG.md`'s
 * own flagged gap: N.E.K.O's `memory_server/gates.py` only runs its
 * background memory-consolidation pass after a real idle threshold, with
 * a minimum-new-messages floor before bothering at all -- this project's
 * own real usage kept confirming why that matters, not just in theory:
 * approval-fatigue numbers logged across multiple sessions (13 of 17
 * `MEMORY_WRITE` proposals rejected in one real session, 3 more expired
 * unactioned in a later short test), and a fallback-degraded run that
 * produced garbage facts from 5 of 6 isolated utterances (`docs/
 * BACKLOG.md`'s own "Open, needs real design work" entry) -- a single,
 * isolated line of speech is genuinely a worse unit to judge "is this a
 * durable fact" from than a short recent window is.
 *
 * A debounce (fires `idleMs` after the *last* utterance) with a max-count
 * safety cap (fires immediately once `maxUtterances` accumulate, so a
 * genuinely chatty, never-quiet session still gets extraction passes
 * instead of buffering forever). Pure logic, `setTimeout`/`clearTimeout`
 * injectable so tests never wait on a real clock -- same "outside-world
 * call, fake it in tests" shape every other module here uses.
 */

export interface PendingUtterance {
  text: string;
  eventId: string;
}

export interface FactExtractionScheduler {
  /** Call once per real utterance, in order. May trigger `runExtraction`
   * synchronously (the max-count cap) or after `idleMs` of no further
   * calls. */
  onUtterance(u: PendingUtterance): void;
  /** Stops the pending timer without flushing -- for a clean shutdown.
   * Whatever's buffered and not yet extracted is simply lost, an
   * accepted, minor edge case for a single-owner personal tool (same
   * "small, real cost, not chased further" bar this project already
   * applies elsewhere, e.g. the "fazer commit"/"comité" STT gap). */
  stop(): void;
}

export interface FactExtractionSchedulerOptions {
  /** How long to wait after the last utterance before extracting.
   * Deliberately longer than a typical spoken-response duration so an
   * ordinary back-and-forth turn (utterance -> spoken reply -> the
   * owner's next utterance moments later) doesn't each get its own
   * extraction pass -- default 20s, longer than N.E.K.O's own 10s since
   * that project's threshold was never benchmarked against this one's
   * real TTS turn-taking cadence. Env-overridable, same convention as
   * every other tuned timing constant in this codebase. */
  idleMs?: number;
  /** Safety cap so a session that never goes quiet still gets extraction
   * passes instead of buffering forever. */
  maxUtterances?: number;
  /** Opaque handle type (`unknown`, not `NodeJS.Timeout`) -- tests inject
   * a fake clock returning plain numeric ids instead of real timers, same
   * "outside-world call, fake it in tests" shape `core/senseConnection.ts`
   * already uses for its own backoff loop. */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

const DEFAULT_IDLE_MS = Number(process.env["JARVIS_FACT_EXTRACTION_IDLE_MS"] ?? 20_000);
const DEFAULT_MAX_UTTERANCES = Number(process.env["JARVIS_FACT_EXTRACTION_MAX_BATCH"] ?? 6);

export function createFactExtractionScheduler(
  runExtraction: (batch: readonly PendingUtterance[]) => void,
  opts: FactExtractionSchedulerOptions = {},
): FactExtractionScheduler {
  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
  const maxUtterances = opts.maxUtterances ?? DEFAULT_MAX_UTTERANCES;
  const setTimeoutFn = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn = opts.clearTimeoutFn ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let buffer: PendingUtterance[] = [];
  let timer: unknown;

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeoutFn(timer);
      timer = undefined;
    }
  }

  function flush(): void {
    clearTimer();
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    runExtraction(batch);
  }

  return {
    onUtterance(u) {
      buffer.push(u);
      clearTimer();
      if (buffer.length >= maxUtterances) {
        flush();
        return;
      }
      timer = setTimeoutFn(flush, idleMs);
    },
    stop() {
      clearTimer();
    },
  };
}
