/**
 * core/senseConnection.ts — wraps a single `ears`/`voice`/`eyes` Unix
 * socket so a dropped connection reconnects and resumes, instead of
 * silently and permanently stalling `core`'s ability to hear/speak/see.
 *
 * Found live, 2026-08-07 (real end-to-end voice + camera testing,
 * PROGRESS.md's dated entry): `core/main.ts` connected to each sense
 * exactly once, at boot, via `connectWithRetry`. If the underlying
 * daemon died and came back afterward (a real `ears` hang that needed a
 * restart to recover from), `core`'s own `for await (const message of
 * readLines(earsSock))` loop just sat on the dead socket forever — no
 * error, no log, no dashboard indicator, only fixable by restarting
 * `core` itself too. This module is the fix: `messages()` keeps
 * `readLines`-ing the *current* live socket, and on drop, reconnects
 * with backoff and resumes — callers iterate it exactly like the raw
 * `readLines(sock)` they used before, forever, transparently.
 *
 * Injectable `connect`/`readLines` (same "outside-world call, fake it
 * in tests" shape as every other module here) so the reconnect/backoff
 * logic itself is unit-testable without a real socket.
 */

import { type Socket } from "node:net";
import { connectWithRetry, readLines, sendLine } from "./ipc.ts";

export interface SenseConnectionDeps {
  /** A single connection attempt -- no internal retry. The backoff loop
   * below owns retry/backoff, not this. */
  connect: (path: string) => Promise<Socket>;
  readLines: (sock: Socket) => AsyncIterable<Record<string, unknown>>;
}

const DEFAULT_DEPS: SenseConnectionDeps = {
  connect: (path) => connectWithRetry(path, 1, 0),
  readLines,
};

export interface SenseConnection {
  /** Sends on whichever socket is currently live. A message sent while
   * reconnecting goes to the stale (already-dead) socket and is lost --
   * same "best effort, not guaranteed delivery" contract `sendLine`
   * always had; nothing here previously guaranteed delivery either. */
  send(message: Record<string, unknown>): void;
  /** Yields every message from every connection this sense ever has,
   * forever. Never throws and never completes on a drop -- it logs,
   * calls `onStateChange(false)`, reconnects with backoff, calls
   * `onStateChange(true)`, and keeps yielding. */
  messages(): AsyncIterable<Record<string, unknown>>;
}

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10_000;
const BACKOFF_MULTIPLIER = 1.5;

async function reconnectForever(
  name: string,
  socketPath: string,
  connect: SenseConnectionDeps["connect"],
  sleep: (ms: number) => Promise<void>,
): Promise<Socket> {
  let delay = INITIAL_BACKOFF_MS;
  for (;;) {
    try {
      return await connect(socketPath);
    } catch {
      console.warn(`core: ${name} reconnect attempt failed, retrying in ${delay}ms`);
      await sleep(delay);
      delay = Math.min(delay * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
    }
  }
}

export function wrapSenseConnection(
  name: string,
  socketPath: string,
  initialSocket: Socket,
  onStateChange: (connected: boolean) => void,
  deps: SenseConnectionDeps = DEFAULT_DEPS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): SenseConnection {
  let current = initialSocket;

  return {
    send(message) {
      sendLine(current, message);
    },
    async *messages() {
      for (;;) {
        try {
          for await (const message of deps.readLines(current)) {
            yield message;
          }
        } catch (err) {
          console.error(`core: ${name} connection error`, err);
        }
        onStateChange(false);
        console.warn(`core: ${name} disconnected, reconnecting...`);
        current = await reconnectForever(name, socketPath, deps.connect, sleep);
        console.log(`core: ${name} reconnected.`);
        onStateChange(true);
      }
    },
  };
}
