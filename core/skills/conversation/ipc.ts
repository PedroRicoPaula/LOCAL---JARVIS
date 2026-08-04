/**
 * core/skills/conversation/ipc.ts — the real `Conversation` for the
 * running app: `say()` sends a `{"type":"speak",...}` line to `voice`;
 * `ask()` sends the question the same way, then waits for the *next*
 * utterance `core/main.ts` receives from `ears`.
 *
 * Deliberately decoupled from any actual `net.Socket` — takes a plain
 * `sendToVoice(text)` function instead, so the queue/timeout logic here
 * is unit-testable without a real socket. `core/main.ts` is what wires
 * the real socket in; that wiring itself isn't unit-tested, same
 * convention as `senses/ears/main.py`/`senses/voice/main.py` not being
 * unit-tested — it's proven live instead.
 *
 * Single in-flight `ask()` at a time: `core/main.ts` only ever awaits one
 * skill interaction per session, so a FIFO of one resolver is enough —
 * no skill built so far needs more.
 */

import type { Conversation } from "../types.ts";

export interface IpcConversation extends Conversation {
  /** Called by `core/main.ts` for every utterance `ears` sends. Returns
   * true if it was consumed as the answer to a pending `ask()` (the
   * caller should NOT also treat it as a fresh dispatch trigger), false
   * if nothing was waiting (a genuinely new utterance). */
  offerUtterance(text: string): boolean;
}

export function createIpcConversation(sendToVoice: (text: string) => void): IpcConversation {
  let pending: { resolve: (text: string) => void; timeoutHandle: ReturnType<typeof setTimeout> } | null = null;

  return {
    say(text: string): void {
      sendToVoice(text);
    },

    ask(question: string, opts?: { timeoutMs?: number }): Promise<string> {
      if (pending) {
        // Shouldn't happen given single-in-flight use, but fail clearly
        // rather than silently dropping the earlier caller forever.
        clearTimeout(pending.timeoutHandle);
        pending = null;
      }
      if (question) sendToVoice(question);

      return new Promise<string>((resolve, reject) => {
        const timeoutMs = opts?.timeoutMs ?? 30_000;
        const timeoutHandle = setTimeout(() => {
          pending = null;
          reject(new Error("ask() timed out waiting for a spoken answer"));
        }, timeoutMs);
        pending = { resolve, timeoutHandle };
      });
    },

    offerUtterance(text: string): boolean {
      if (!pending) return false;
      clearTimeout(pending.timeoutHandle);
      const { resolve } = pending;
      pending = null;
      resolve(text);
      return true;
    },
  };
}
