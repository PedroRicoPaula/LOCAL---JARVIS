/**
 * skills/github/manifest.ts — docs/SKILLS.md § 2. Read-only, over the
 * official remote GitHub MCP server (real-checked 2026-08-08:
 * https://api.githubcopilot.com/mcp/, free with a personal access token
 * -- see core/mcp/setup.ts). Every call is `MCP_TOOL_CALL` -- yellow,
 * requires approval, uniformly (see `shared/types.ts`'s own docstring
 * on that capability for why no MCP call is trusted to skip it; kept
 * that way here deliberately, not revisited yet even with real evidence
 * of approval fatigue -- owner's call, 2026-08-08).
 *
 * Second real MCP-backed skill, after `skills/gmail` -- see
 * `skills/_shared/mcpTool.ts` for the shared propose/outcome-handling
 * helpers both use, and `docs/SKILLS.md`'s MCP section for the pattern.
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "github",
  version: "1.0.0",
  description: "List the owner's GitHub repositories via the official GitHub MCP server -- read-only, never writes.",

  intents: [
    {
      id: "list_repos",
      description: "List the owner's GitHub repositories.",
      examples: [
        "what are my repos",
        "list my github repositories",
        "show me my repos on github",
        "what repositories do I have",
        "check my github",
        // PT-PT paraphrases (ADR-033)
        "lista os meus repositórios",
        "que repositórios é que eu tenho no github",
        "mostra-me os meus repos",
      ],
      lanes: ["converse", "act"],
    },
  ],

  capabilities: ["MCP_TOOL_CALL"],
};
