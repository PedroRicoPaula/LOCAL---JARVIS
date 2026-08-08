/**
 * skills/gmail/index.ts — read-only Gmail search over the official
 * Gmail MCP server. Every call goes through `ctx.propose({capability:
 * "MCP_TOOL_CALL", ...})` -- never a direct tool call, matching every
 * other capability's rule (docs/SKILLS.md § 1).
 *
 * Deliberately does not hardcode the server's real tool name or
 * argument shape -- neither was verifiable without a live, authorized
 * connection (Google's docs describe setup, not the tool catalogue
 * itself), and this project has already been burned more than once
 * this session by guessing a third-party API's exact names. Instead:
 * `findSearchTool` pattern-matches against whatever `ctx.mcp.
 * listTools("gmail")` actually reports at runtime, and
 * `guessQueryArgName` reads the tool's own declared `inputSchema`
 * rather than assuming an argument key. If the real server doesn't
 * match either guess, this says so honestly instead of guessing blind
 * -- see the "couldn't figure out" branches below.
 */

import type { McpJsonSchema, McpToolInfo } from "../../core/mcp/registry.ts";
import type { Skill, SkillContext } from "../../core/skills/types.ts";
import { extractOrNull } from "../_shared/extract.ts";
import { proposeMcpTool, requireMcpServer } from "../_shared/mcpTool.ts";
import { manifest } from "./manifest.ts";

const SEARCH_TOOL_PATTERN = /search|query|list.*(message|email|thread)/i;

export function findSearchTool(tools: readonly McpToolInfo[]): McpToolInfo | null {
  return tools.find((t) => SEARCH_TOOL_PATTERN.test(t.name) || (t.description !== undefined && SEARCH_TOOL_PATTERN.test(t.description))) ?? null;
}

const COMMON_QUERY_ARG_NAMES = ["query", "q", "search"];

/** Prefers the single required string property; falls back to the
 * single string property if there's only one at all; falls back to a
 * conventional name if the schema happens to have one. `null` means
 * "genuinely couldn't tell" -- the caller must say so, not guess. */
export function guessQueryArgName(schema: McpJsonSchema | undefined): string | null {
  if (!schema?.properties) return null;
  const stringProps = Object.entries(schema.properties).filter(([, v]) => v.type === "string");
  const required = new Set(schema.required ?? []);
  const requiredStringProps = stringProps.filter(([name]) => required.has(name));
  if (requiredStringProps.length === 1) return requiredStringProps[0]![0];
  if (stringProps.length === 1) return stringProps[0]![0];
  for (const name of COMMON_QUERY_ARG_NAMES) {
    if (name in schema.properties) return name;
  }
  return null;
}

const QUERY_EXTRACT_SYSTEM = `Turn what the owner said into a short Gmail search query -- just the
important keywords/names/topics, in Gmail search syntax if it clearly
applies (e.g. "from:john invoice"). No prose, no quotes, no leading
"search for". If they just want a general check ("check my email",
"any new emails", "do I have anything new"), respond with exactly:
is:unread`;

async function extractQuery(ctx: SkillContext, utterance: string): Promise<string> {
  return (await extractOrNull(ctx, QUERY_EXTRACT_SYSTEM, utterance, { maxTokens: 30, catchErrors: true })) ?? "is:unread";
}

export const skill: Skill = {
  manifest,

  async handle(input, ctx): Promise<{ speech: string }> {
    const notConnected = "Gmail isn't connected yet -- that needs a one-time setup I can't do myself.";
    if (!requireMcpServer(ctx, "gmail", notConnected)) {
      return { speech: notConnected };
    }

    const tools = ctx.mcp.listTools("gmail");
    const tool = findSearchTool(tools);
    if (!tool) {
      const speech = "Gmail is connected, but I can't find a search tool on it.";
      ctx.say(speech);
      return { speech };
    }

    const argName = guessQueryArgName(tool.inputSchema);
    if (!argName) {
      const speech = `Gmail's "${tool.name}" tool doesn't have an argument shape I recognize.`;
      ctx.say(speech);
      return { speech };
    }

    const query = await extractQuery(ctx, input.utterance);
    const speech = await proposeMcpTool(
      ctx,
      "gmail",
      tool.name,
      { [argName]: query },
      `Search Gmail: ${query}`,
      (result) => {
        const text = typeof result === "string" ? result.trim() : "";
        return text ? text : "Nothing matched that in your Gmail.";
      },
      {
        rejected: "Okay, didn't check your email.",
        expired: "The request to check your email expired before you answered.",
        error: (detail) => `Couldn't check your email -- ${detail}.`,
      },
    );
    ctx.say(speech);
    return { speech };
  },
};
