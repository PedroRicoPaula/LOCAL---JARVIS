/**
 * core/skills/mcp.ts — the narrow, read-only slice of `McpRegistry` a
 * skill actually gets (`SkillContext.mcp`): discovery only
 * (`hasServer`/`listTools`), never `callTool` -- invoking a tool always
 * goes through `ctx.propose({capability: "MCP_TOOL_CALL", ...})`, same
 * "propose, never execute directly" rule every other capability
 * follows (docs/SKILLS.md § 1).
 *
 * Unlike `camera.ts`'s stub (which throws -- Phase 8 genuinely doesn't
 * exist yet), the empty default here degrades gracefully: no MCP
 * server being registered is a normal, expected runtime state (the
 * owner hasn't run the one-time authorization script yet, or a
 * specific server isn't configured), not a missing feature. A skill
 * checking `ctx.mcp.hasServer(...)` should get an honest `false`, not
 * a crash.
 */

import type { McpToolLister } from "../mcp/registry.ts";

export function createEmptyMcpToolLister(): McpToolLister {
  return {
    hasServer: () => false,
    listTools: () => [],
  };
}
