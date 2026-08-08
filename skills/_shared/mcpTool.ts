/**
 * skills/_shared/mcpTool.ts — the mechanical, identical-every-time half of
 * an MCP-backed skill: check the server is connected, propose the
 * `MCP_TOOL_CALL`, and turn the four possible outcomes (ok / rejected /
 * expired / error) into speech. `skills/gmail` wrote this inline first;
 * `skills/github` is the second real user, extracted here rather than
 * copy-pasted (docs/SKILLS.md documents this pattern for the next one).
 *
 * Deliberately does NOT include tool-matching (a regex over
 * `ctx.mcp.listTools()`) or argument-extraction (a model call turning the
 * utterance into tool arguments) -- those differ per skill by design, and
 * folding them in here would hide each skill's own "don't guess a
 * third-party server's tool names or argument shape" reasoning behind a
 * one-size-fits-all helper it doesn't actually fit.
 *
 * Skills can share code with each other and with `core/skills/` -- only
 * importing `core/executors/**` is off limits (CLAUDE.md § 5b,
 * ESLint-enforced). This file imports nothing from there.
 */

import type { SkillContext } from "../../core/skills/types.ts";

/** `false` means the caller already spoke a "not connected" fallback and
 * should stop -- same shape every MCP skill's own opening check had. */
export function requireMcpServer(ctx: SkillContext, serverId: string, notConnectedMessage: string): boolean {
  if (ctx.mcp.hasServer(serverId)) return true;
  ctx.say(notConnectedMessage);
  return false;
}

export interface McpOutcomeMessages {
  rejected: string;
  expired: string;
  error: (detail: string) => string;
}

/** Proposes the `MCP_TOOL_CALL`, awaits the gate's decision, and returns
 * the line to speak -- `onSuccess` only runs on `outcome.ok`, so it never
 * needs to handle the rejected/expired/error cases itself. */
export async function proposeMcpTool(
  ctx: SkillContext,
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
  humanSummary: string,
  onSuccess: (result: unknown) => string,
  messages: McpOutcomeMessages,
): Promise<string> {
  const outcome = await ctx.propose({
    capability: "MCP_TOOL_CALL",
    humanSummary,
    payload: { serverId, toolName, arguments: args },
  });
  if (outcome.ok) return onSuccess(outcome.result);
  if (outcome.reason === "rejected") return messages.rejected;
  if (outcome.reason === "expired") return messages.expired;
  return messages.error(outcome.detail ?? "something went wrong");
}
