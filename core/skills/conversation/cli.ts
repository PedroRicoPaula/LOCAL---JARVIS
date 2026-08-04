/**
 * core/skills/conversation/cli.ts — a real (not fake) `Conversation`:
 * stdio in, stdout out.
 *
 * No phase's checklist yet wires `core` to `senses/ears`/`senses/voice`
 * over IPC (see `core/skills/types.ts`'s docstring and PROGRESS.md's
 * Phase 5 log) — that integration is a genuine gap between the two sides
 * of the system built so far. This lets the skill host be exercised
 * end-to-end today, and is the seam a future integration phase replaces
 * with a real IPC-backed `Conversation` without touching any skill code.
 */

import { createInterface } from "node:readline/promises";
import type { Conversation } from "../types.ts";

export function createCliConversation(): Conversation {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return {
    say(text: string): void {
      process.stdout.write(`jarvis: ${text}\n`);
    },
    async ask(question: string, opts?: { timeoutMs?: number }): Promise<string> {
      if (question) process.stdout.write(`jarvis: ${question}\n`);
      const timeoutMs = opts?.timeoutMs ?? 30_000;
      const answerPromise = rl.question("you: ");
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error("ask() timed out waiting for an answer")), timeoutMs);
      });
      return Promise.race([answerPromise, timeoutPromise]);
    },
  };
}
