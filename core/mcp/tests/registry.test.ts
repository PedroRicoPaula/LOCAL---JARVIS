import assert from "node:assert/strict";
import { test } from "node:test";
import type { McpConnection, McpToolInfo } from "../registry.ts";
import { McpRegistry } from "../registry.ts";

function fakeConnection(tools: McpToolInfo[], callResult: { ok: boolean; text?: string; error?: string } = { ok: true, text: "" }) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const connection: McpConnection = {
    async listTools() {
      return tools;
    },
    async callTool(name, args) {
      calls.push({ name, args });
      return callResult;
    },
  };
  return { connection, calls };
}

test("register() connects and caches the server's tool list", async () => {
  const { connection } = fakeConnection([{ name: "search", description: "search things", readOnlyHint: true }]);
  const registry = new McpRegistry(async () => connection);

  await registry.register({ id: "gmail", url: "https://example.invalid", getAccessToken: async () => "t" });

  assert.equal(registry.hasServer("gmail"), true);
  assert.deepEqual(registry.listTools("gmail"), [{ name: "search", description: "search things", readOnlyHint: true }]);
});

test("hasServer/listTools are honest for a server never registered", () => {
  const registry = new McpRegistry(async () => fakeConnection([]).connection);
  assert.equal(registry.hasServer("nope"), false);
  assert.deepEqual(registry.listTools("nope"), []);
});

test("callTool delegates to the connection with the exact name/args given", async () => {
  const { connection, calls } = fakeConnection([], { ok: true, text: "result text" });
  const registry = new McpRegistry(async () => connection);
  await registry.register({ id: "gmail", url: "https://example.invalid", getAccessToken: async () => "t" });

  const result = await registry.callTool("gmail", "search_emails", { query: "invoice" });

  assert.deepEqual(result, { ok: true, text: "result text" });
  assert.deepEqual(calls, [{ name: "search_emails", args: { query: "invoice" } }]);
});

test("callTool against an unregistered server fails honestly, never silently no-ops", async () => {
  const registry = new McpRegistry(async () => fakeConnection([]).connection);

  const result = await registry.callTool("not-connected", "anything", {});

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /not connected/i);
});

test("register() passes each server's own getAccessToken through to the connect function, once per server", async () => {
  const seenConfigs: string[] = [];
  const registry = new McpRegistry(async (config) => {
    seenConfigs.push(config.id);
    return fakeConnection([]).connection;
  });

  await registry.register({ id: "a", url: "https://example.invalid", getAccessToken: async () => "t" });
  await registry.register({ id: "b", url: "https://example.invalid", getAccessToken: async () => "t" });

  assert.deepEqual(seenConfigs, ["a", "b"]);
});
