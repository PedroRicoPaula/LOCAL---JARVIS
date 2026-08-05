import assert from "node:assert/strict";
import { test } from "node:test";
import type { McpRegistry } from "../../mcp/registry.ts";
import { createMcpToolExecutor } from "../mcp.ts";

function fakeRegistry(result: { ok: boolean; text?: string; error?: string }) {
  const calls: { serverId: string; toolName: string; args: Record<string, unknown> }[] = [];
  const registry = {
    callTool: async (serverId: string, toolName: string, args: Record<string, unknown>) => {
      calls.push({ serverId, toolName, args });
      return result;
    },
  } as unknown as McpRegistry;
  return { registry, calls };
}

test("a valid payload calls registry.callTool with exactly what was approved", async () => {
  const { registry, calls } = fakeRegistry({ ok: true, text: "3 unread emails" });
  const executor = createMcpToolExecutor(registry);

  const outcome = await executor({ serverId: "gmail", toolName: "search_emails", arguments: { query: "is:unread" } });

  assert.deepEqual(outcome, { ok: true, result: "3 unread emails" });
  assert.deepEqual(calls, [{ serverId: "gmail", toolName: "search_emails", args: { query: "is:unread" } }]);
});

test("a malformed payload is rejected without calling the registry", async () => {
  const { registry, calls } = fakeRegistry({ ok: true, text: "" });
  const executor = createMcpToolExecutor(registry);

  const outcome = await executor({ serverId: "gmail" }); // missing toolName/arguments

  assert.equal(outcome.ok, false);
  assert.equal(calls.length, 0);
});

test("a real MCP tool failure is reported, not swallowed", async () => {
  const { registry } = fakeRegistry({ ok: false, error: "token expired" });
  const executor = createMcpToolExecutor(registry);

  const outcome = await executor({ serverId: "gmail", toolName: "search_emails", arguments: {} });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, "token expired");
});
