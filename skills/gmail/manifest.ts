/**
 * skills/gmail/manifest.ts — docs/SKILLS.md § 2. Read-only search/read
 * over Google's own official Gmail MCP server (`bench/gmail_authorize.ts`
 * does the one-time setup). Every call is `MCP_TOOL_CALL` -- yellow,
 * requires approval, uniformly (see `shared/types.ts`'s own docstring
 * on that capability for why no MCP call is trusted to skip it).
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "gmail",
  version: "1.0.0",
  description: "Search and check the owner's Gmail via the official Gmail MCP server -- read-only, never sends anything.",

  intents: [
    {
      id: "check_email",
      description: "Search or check the owner's Gmail inbox.",
      examples: [
        "check my email",
        "do I have any new emails",
        "did I get an email from John",
        "search my email for the invoice",
        "any unread emails",
        "check gmail for something from Sarah about the trip",
        "is there an email from the bank",
      ],
      lanes: ["converse", "act"],
    },
  ],

  capabilities: ["MCP_TOOL_CALL"],
};
