/**
 * core/ipc.ts — the Node side of `senses/ipc.py`'s tiny Unix-socket,
 * newline-delimited-JSON transport. `ears` and `voice` are servers that
 * accept exactly one client each; `core` is that client — this was
 * `senses/ipc.py`'s own docstring's plan since Phase 1
 * ("whoever orchestrates them ... core/ from Phase 3 on"), only actually
 * wired up now. See PROGRESS.md's log for why the gap existed this long.
 */

import { createConnection, type Socket } from "node:net";

export function connectWithRetry(socketPath: string, attempts = 20, delayMs = 500): Promise<Socket> {
  return new Promise((resolve, reject) => {
    let attemptsLeft = attempts;
    const tryOnce = () => {
      const sock = createConnection(socketPath);
      const onError = (err: Error) => {
        sock.destroy();
        attemptsLeft -= 1;
        if (attemptsLeft <= 0) {
          reject(err);
          return;
        }
        setTimeout(tryOnce, delayMs);
      };
      sock.once("error", onError);
      sock.once("connect", () => {
        sock.removeListener("error", onError);
        resolve(sock);
      });
    };
    tryOnce();
  });
}

export function sendLine(sock: Socket, message: Record<string, unknown>): void {
  sock.write(JSON.stringify(message) + "\n");
}

export async function* readLines(sock: Socket): AsyncIterable<Record<string, unknown>> {
  let buffer = "";
  for await (const chunk of sock) {
    buffer += (chunk as Buffer).toString("utf8");
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.trim()) yield JSON.parse(line) as Record<string, unknown>;
    }
  }
}
