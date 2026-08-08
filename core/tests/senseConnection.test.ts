import assert from "node:assert/strict";
import { test } from "node:test";
import { wrapSenseConnection, type SenseConnectionDeps } from "../senseConnection.ts";

type FakeSocket = { id: number; write: (data: string) => void };

function fakeSocket(id: number, writes: string[]): FakeSocket {
  return { id, write: (data) => writes.push(data) };
}

function fakeDeps(
  linesPerSocket: Record<number, Record<string, unknown>[]>,
  connectResults: (FakeSocket | Error)[],
): { deps: SenseConnectionDeps; connectCalls: number[] } {
  const connectCalls: number[] = [];
  let connectIndex = 0;
  const deps: SenseConnectionDeps = {
    connect: async (path) => {
      connectCalls.push(connectIndex);
      const result = connectResults[connectIndex];
      connectIndex += 1;
      if (result instanceof Error) throw result;
      if (!result) throw new Error(`no more fake connect results for ${path}`);
      return result as never;
    },
    readLines: async function* (sock: unknown) {
      const lines = linesPerSocket[(sock as FakeSocket).id] ?? [];
      for (const line of lines) yield line;
    },
  };
  return { deps, connectCalls };
}

async function collect(iterable: AsyncIterable<Record<string, unknown>>, count: number): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for await (const msg of iterable) {
    out.push(msg);
    if (out.length >= count) break;
  }
  return out;
}

test("messages() yields from the initial socket with no reconnect needed", async () => {
  const { deps } = fakeDeps({ 1: [{ type: "a" }, { type: "b" }] }, []);
  const states: boolean[] = [];
  const conn = wrapSenseConnection("test", "/tmp/x.sock", { id: 1 } as never, (c) => states.push(c), deps);

  const received = await collect(conn.messages(), 2);
  assert.deepEqual(received, [{ type: "a" }, { type: "b" }]);
  assert.deepEqual(states, []);
});

test("on drop, reconnects and resumes yielding from the new socket", async () => {
  const { deps } = fakeDeps(
    { 1: [{ type: "a" }], 2: [{ type: "b" }] },
    [{ id: 2 } as never],
  );
  const states: boolean[] = [];
  const conn = wrapSenseConnection("test", "/tmp/x.sock", { id: 1 } as never, (c) => states.push(c), deps, async () => {});

  const received = await collect(conn.messages(), 2);
  assert.deepEqual(received, [{ type: "a" }, { type: "b" }]);
  assert.deepEqual(states, [false, true]);
});

test("retries with backoff until a reconnect attempt succeeds", async () => {
  const { deps, connectCalls } = fakeDeps(
    { 1: [{ type: "a" }], 2: [{ type: "b" }] },
    [new Error("refused"), new Error("refused"), { id: 2 } as never],
  );
  const sleeps: number[] = [];
  const conn = wrapSenseConnection(
    "test",
    "/tmp/x.sock",
    { id: 1 } as never,
    () => {},
    deps,
    async (ms) => {
      sleeps.push(ms);
    },
  );

  const received = await collect(conn.messages(), 2);
  assert.deepEqual(received, [{ type: "a" }, { type: "b" }]);
  assert.equal(connectCalls.length, 3);
  assert.deepEqual(sleeps, [500, 750]);
});

test("send() targets the current socket, and switches after a reconnect", async () => {
  const writes1: string[] = [];
  const writes2: string[] = [];
  const sock1 = fakeSocket(1, writes1);
  const sock2 = fakeSocket(2, writes2);
  const { deps } = fakeDeps({ 1: [{ type: "a" }], 2: [{ type: "b" }] }, [sock2]);
  const conn = wrapSenseConnection("test", "/tmp/x.sock", sock1 as never, () => {}, deps, async () => {});

  conn.send({ type: "before" });
  assert.deepEqual(writes1, [JSON.stringify({ type: "before" }) + "\n"]);

  await collect(conn.messages(), 2); // drains socket 1, drop, reconnect to socket 2

  conn.send({ type: "after" });
  assert.deepEqual(writes2, [JSON.stringify({ type: "after" }) + "\n"]);
});
