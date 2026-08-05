/**
 * core/executors/mcp.ts — `MCP_TOOL_CALL`'s executor. Same factory
 * shape as `memory.ts`'s `createWriteFactExecutor`: closes over the one
 * real dependency (`McpRegistry`), returns a function matching `Gate`'s
 * `Executor` type. Only ever runs after a real approval -- the payload
 * (server, tool, arguments) is exactly what the owner saw in the
 * `humanSummary` they approved, nothing re-decided here.
 */

import type { McpRegistry } from "../mcp/registry.ts";

export interface McpToolCallPayload {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

function isMcpToolCallPayload(payload: unknown): payload is McpToolCallPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p["serverId"] !== "string" || p["serverId"].trim() === "") return false;
  if (typeof p["toolName"] !== "string" || p["toolName"].trim() === "") return false;
  if (typeof p["arguments"] !== "object" || p["arguments"] === null) return false;
  return true;
}

export function createMcpToolExecutor(registry: McpRegistry) {
  return async (payload: unknown): Promise<{ ok: boolean; result?: unknown; error?: string }> => {
    if (!isMcpToolCallPayload(payload)) {
      return { ok: false, error: `malformed mcp_tool_call payload: ${JSON.stringify(payload)}` };
    }
    const result = await registry.callTool(payload.serverId, payload.toolName, payload.arguments);
    if (!result.ok) {
      return { ok: false, error: result.error ?? "MCP tool call failed" };
    }
    return { ok: true, result: result.text };
  };
}
