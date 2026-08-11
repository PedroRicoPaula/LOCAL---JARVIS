import assert from "node:assert/strict";
import { test } from "node:test";
import { createFactExtractionScheduler, type PendingUtterance } from "../factExtractionScheduler.ts";

/** A fake, manually-advanced clock -- no real waiting, same reasoning
 * `core/senseConnection.ts`'s own tests already use for its backoff loop. */
function fakeClock(): {
  setTimeoutFn: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn: (id: unknown) => void;
  advance: (ms: number) => void;
} {
  let nextId = 1;
  const pending = new Map<number, { fn: () => void; dueAt: number }>();
  let now = 0;
  return {
    setTimeoutFn: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { fn, dueAt: now + ms });
      return id;
    },
    clearTimeoutFn: (id) => {
      pending.delete(id as number);
    },
    advance(ms) {
      now += ms;
      for (const [id, entry] of [...pending.entries()]) {
        if (entry.dueAt <= now) {
          pending.delete(id);
          entry.fn();
        }
      }
    },
  };
}

function u(text: string, eventId = text): PendingUtterance {
  return { text, eventId };
}

test("does not fire before idleMs has passed", () => {
  const clock = fakeClock();
  const batches: (readonly PendingUtterance[])[] = [];
  const scheduler = createFactExtractionScheduler((b) => batches.push(b), {
    idleMs: 20_000,
    maxUtterances: 10,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  scheduler.onUtterance(u("hello"));
  clock.advance(19_999);

  assert.deepEqual(batches, []);
});

test("fires once idleMs of quiet has passed, with the buffered utterance", () => {
  const clock = fakeClock();
  const batches: (readonly PendingUtterance[])[] = [];
  const scheduler = createFactExtractionScheduler((b) => batches.push(b), {
    idleMs: 20_000,
    maxUtterances: 10,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  scheduler.onUtterance(u("I don't eat peanuts"));
  clock.advance(20_000);

  assert.deepEqual(batches, [[u("I don't eat peanuts")]]);
});

test("a second utterance before idle resets the timer -- no extraction until quiet after the LAST one", () => {
  const clock = fakeClock();
  const batches: (readonly PendingUtterance[])[] = [];
  const scheduler = createFactExtractionScheduler((b) => batches.push(b), {
    idleMs: 20_000,
    maxUtterances: 10,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  scheduler.onUtterance(u("a"));
  clock.advance(15_000);
  scheduler.onUtterance(u("b"));
  clock.advance(15_000); // 30s since "a", but only 15s since "b" -- must not have fired yet

  assert.deepEqual(batches, []);

  clock.advance(5_000); // now 20s since "b"
  assert.deepEqual(batches, [[u("a"), u("b")]]);
});

test("hitting maxUtterances flushes immediately, without waiting for idle", () => {
  const clock = fakeClock();
  const batches: (readonly PendingUtterance[])[] = [];
  const scheduler = createFactExtractionScheduler((b) => batches.push(b), {
    idleMs: 20_000,
    maxUtterances: 3,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  scheduler.onUtterance(u("a"));
  scheduler.onUtterance(u("b"));
  scheduler.onUtterance(u("c"));

  assert.deepEqual(batches, [[u("a"), u("b"), u("c")]]);
});

test("after a flush, the buffer starts fresh -- old utterances are never re-extracted", () => {
  const clock = fakeClock();
  const batches: (readonly PendingUtterance[])[] = [];
  const scheduler = createFactExtractionScheduler((b) => batches.push(b), {
    idleMs: 20_000,
    maxUtterances: 10,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  scheduler.onUtterance(u("first batch"));
  clock.advance(20_000);
  scheduler.onUtterance(u("second batch"));
  clock.advance(20_000);

  assert.deepEqual(batches, [[u("first batch")], [u("second batch")]]);
});

test("stop() cancels a pending timer -- nothing fires after", () => {
  const clock = fakeClock();
  const batches: (readonly PendingUtterance[])[] = [];
  const scheduler = createFactExtractionScheduler((b) => batches.push(b), {
    idleMs: 20_000,
    maxUtterances: 10,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  scheduler.onUtterance(u("a"));
  scheduler.stop();
  clock.advance(30_000);

  assert.deepEqual(batches, []);
});
