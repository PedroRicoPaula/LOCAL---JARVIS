/**
 * skills/github/index.test.ts — docs/SKILLS.md § 7's cases that apply,
 * plus this skill's own real-uncertainty cases (no server connected, no
 * matching tool found, a tool needing an argument this skill can't
 * supply) -- same shape as skills/gmail/index.test.ts, its sibling.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeMcpToolLister, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import type { ProposedAction } from "../../shared/types.ts";
import { findRepoListTool, hasNoRequiredArgs, skill } from "./index.ts";

const LIST_REPOS_TOOL = {
  name: "list_repositories",
  description: "List repositories for the authenticated user",
  readOnlyHint: true,
  inputSchema: { type: "object", properties: {} },
};

test("no GitHub server connected: says so plainly, never attempts a list", async () => {
  const ctx = fakeSkillContext({ mcp: fakeMcpToolLister() });

  const result = await skill.handle({ utterance: "what are my repos", intent: "list_repos", sessionId: "s1" }, ctx);

  assert.match(result.speech, /isn't connected/i);
});

test("GitHub connected but no repo-listing tool found: honest, not a guess", async () => {
  const ctx = fakeSkillContext({ mcp: fakeMcpToolLister({ github: [{ name: "get_me", description: "returns the authenticated user" }] }) });

  const result = await skill.handle({ utterance: "what are my repos", intent: "list_repos", sessionId: "s1" }, ctx);

  assert.match(result.speech, /can't find a tool/i);
});

test("a tool requiring an argument this skill can't supply is reported honestly, not called blind", async () => {
  const ctx = fakeSkillContext({
    mcp: fakeMcpToolLister({
      github: [{ name: "list_repositories", inputSchema: { type: "object", properties: { owner: { type: "string" } }, required: ["owner"] } }],
    }),
    propose: async () => {
      throw new Error("must not propose when a required argument is missing");
    },
  });

  const result = await skill.handle({ utterance: "what are my repos", intent: "list_repos", sessionId: "s1" }, ctx);

  assert.match(result.speech, /argument I don't have/i);
});

test("happy path: finds the tool, proposes with no arguments, speaks the result", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    mcp: fakeMcpToolLister({ github: [LIST_REPOS_TOOL] }),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: "jarvis, dotfiles, some-old-project" };
    },
  });

  const result = await skill.handle({ utterance: "what are my repos", intent: "list_repos", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "jarvis, dotfiles, some-old-project");
  assert.deepEqual(proposals, [
    {
      capability: "MCP_TOOL_CALL",
      humanSummary: "List GitHub repositories",
      payload: { serverId: "github", toolName: "list_repositories", arguments: {} },
    },
  ]);
});

test("a successful call with an empty result speaks an honest fallback, not silence", async () => {
  const ctx = fakeSkillContext({
    mcp: fakeMcpToolLister({ github: [LIST_REPOS_TOOL] }),
    propose: async () => ({ ok: true, result: "" }),
  });

  const result = await skill.handle({ utterance: "what are my repos", intent: "list_repos", sessionId: "s1" }, ctx);

  assert.match(result.speech, /don't have any repositories|none came back/i);
});

test("owner rejects: says so, not a false success", async () => {
  const ctx = fakeSkillContext({
    mcp: fakeMcpToolLister({ github: [LIST_REPOS_TOOL] }),
    propose: async () => ({ ok: false, reason: "rejected" }),
  });

  const result = await skill.handle({ utterance: "what are my repos", intent: "list_repos", sessionId: "s1" }, ctx);

  assert.match(result.speech, /didn't check/i);
});

test("a real MCP/tool failure is reported, not swallowed", async () => {
  const ctx = fakeSkillContext({
    mcp: fakeMcpToolLister({ github: [LIST_REPOS_TOOL] }),
    propose: async () => ({ ok: false, reason: "error", detail: "rate limited" }),
  });

  const result = await skill.handle({ utterance: "what are my repos", intent: "list_repos", sessionId: "s1" }, ctx);

  assert.match(result.speech, /rate limited/);
});

test("findRepoListTool matches by name or description, case-insensitively", () => {
  assert.equal(findRepoListTool([{ name: "list_repositories" }])?.name, "list_repositories");
  assert.equal(findRepoListTool([{ name: "search_repos" }])?.name, "search_repos");
  assert.equal(findRepoListTool([{ name: "get_me", description: "List My Repos" }])?.name, "get_me");
  assert.equal(findRepoListTool([{ name: "get_profile" }]), null);
});

test("hasNoRequiredArgs: no schema, no properties, or an empty required list are all safe to call with {}", () => {
  assert.equal(hasNoRequiredArgs(undefined), true);
  assert.equal(hasNoRequiredArgs({ type: "object", properties: {} }), true);
  assert.equal(hasNoRequiredArgs({ type: "object", properties: { owner: { type: "string" } }, required: [] }), true);
});

test("hasNoRequiredArgs: any required property means false", () => {
  assert.equal(hasNoRequiredArgs({ type: "object", properties: { owner: { type: "string" } }, required: ["owner"] }), false);
});
