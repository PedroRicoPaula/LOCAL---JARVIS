/**
 * skills/github/index.ts — lists the owner's GitHub repositories over the
 * official remote GitHub MCP server. Every call goes through
 * `ctx.propose({capability: "MCP_TOOL_CALL", ...})` -- never a direct
 * tool call, matching every other capability's rule (docs/SKILLS.md § 1).
 *
 * Same non-guessing discipline `skills/gmail`'s own docstring states:
 * GitHub's real tool catalogue was never verifiable without a live,
 * authorized connection (the owner's own PAT), so `findRepoListTool`
 * pattern-matches against whatever `ctx.mcp.listTools("github")` actually
 * reports at runtime rather than assuming a literal tool name -- confirm/
 * adjust `REPO_LIST_PATTERN` against the real catalogue once connected
 * (PROGRESS.md's owner-required verification step). If the tool needs an
 * argument this skill has no value for, this says so honestly instead of
 * guessing one.
 */

import type { McpJsonSchema, McpToolInfo } from "../../core/mcp/registry.ts";
import type { Skill } from "../../core/skills/types.ts";
import { proposeMcpTool, requireMcpServer } from "../_shared/mcpTool.ts";
import { manifest } from "./manifest.ts";

const REPO_LIST_PATTERN = /list.*repo|search.*repo|my.*repo|repos?.*list/i;

export function findRepoListTool(tools: readonly McpToolInfo[]): McpToolInfo | null {
  return tools.find((t) => REPO_LIST_PATTERN.test(t.name) || (t.description !== undefined && REPO_LIST_PATTERN.test(t.description))) ?? null;
}

/** A tool with no *required* properties is safe to call with no
 * arguments -- for "list my repos," an authenticated call with nothing
 * else specified conventionally means "the authenticated owner's own
 * repos." A tool that requires something (an owner/org name this skill
 * was never given) is refused honestly rather than guessed. */
export function hasNoRequiredArgs(schema: McpJsonSchema | undefined): boolean {
  return !schema?.required || schema.required.length === 0;
}

function formatRepoList(result: unknown): string {
  const text = typeof result === "string" ? result.trim() : "";
  return text ? text : "You don't have any repositories, or none came back from GitHub.";
}

export const skill: Skill = {
  manifest,

  async handle(_input, ctx): Promise<{ speech: string }> {
    const notConnected = "GitHub isn't connected yet -- that needs a one-time setup I can't do myself.";
    if (!requireMcpServer(ctx, "github", notConnected)) {
      return { speech: notConnected };
    }

    const tools = ctx.mcp.listTools("github");
    const tool = findRepoListTool(tools);
    if (!tool) {
      const speech = "GitHub is connected, but I can't find a tool to list repositories on it.";
      ctx.say(speech);
      return { speech };
    }

    if (!hasNoRequiredArgs(tool.inputSchema)) {
      const speech = `GitHub's "${tool.name}" tool needs an argument I don't have -- I can't call it blind.`;
      ctx.say(speech);
      return { speech };
    }

    const speech = await proposeMcpTool(ctx, "github", tool.name, {}, "List GitHub repositories", formatRepoList, {
      rejected: "Okay, didn't check your repositories.",
      expired: "The request to list your repositories expired before you answered.",
      error: (detail) => `Couldn't list your repositories -- ${detail}.`,
    });
    ctx.say(speech);
    return { speech };
  },
};
