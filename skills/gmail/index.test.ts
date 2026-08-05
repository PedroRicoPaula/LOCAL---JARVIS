/**
 * skills/gmail/index.test.ts — docs/SKILLS.md § 7's cases that apply,
 * plus this skill's own real-uncertainty cases (no server connected,
 * no matching tool found, an unrecognized argument shape) -- all of
 * which are genuinely reachable states given nothing here was
 * verified against a live, authorized connection yet.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeMcpToolLister, fakeRouter, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import type { ProposedAction } from "../../shared/types.ts";
import { findSearchTool, guessQueryArgName, skill } from "./index.ts";

const SEARCH_TOOL = {
  name: "search_messages",
  description: "Search Gmail messages by query",
  readOnlyHint: true,
  inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
};

test("no Gmail server connected: says so plainly, never attempts a search", async () => {
  const ctx = fakeSkillContext({ mcp: fakeMcpToolLister() });

  const result = await skill.handle({ utterance: "check my email", intent: "check_email", sessionId: "s1" }, ctx);

  assert.match(result.speech, /isn't connected/i);
});

test("Gmail connected but no search-like tool found: honest, not a guess", async () => {
  const ctx = fakeSkillContext({ mcp: fakeMcpToolLister({ gmail: [{ name: "get_profile", description: "returns account info" }] }) });

  const result = await skill.handle({ utterance: "check my email", intent: "check_email", sessionId: "s1" }, ctx);

  assert.match(result.speech, /can't find a search tool/i);
});

test("a tool with no recognizable argument shape is reported honestly, not called blind", async () => {
  const ctx = fakeSkillContext({
    mcp: fakeMcpToolLister({
      gmail: [{ name: "search_messages", inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "boolean" } } } }],
    }),
    propose: async () => {
      throw new Error("must not propose when the argument shape is unrecognized");
    },
  });

  const result = await skill.handle({ utterance: "check my email", intent: "check_email", sessionId: "s1" }, ctx);

  assert.match(result.speech, /argument shape/i);
});

test("happy path: finds the tool, extracts a query, proposes with the right argument key, speaks the result", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    mcp: fakeMcpToolLister({ gmail: [SEARCH_TOOL] }),
    router: fakeRouter({ completeReturns: "from:john invoice" }),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: "Found 2 matching emails from John about the invoice." };
    },
  });

  const result = await skill.handle({ utterance: "did I get an invoice from john", intent: "check_email", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Found 2 matching emails from John about the invoice.");
  assert.equal(proposals[0]?.capability, "MCP_TOOL_CALL");
  assert.match(proposals[0]?.humanSummary ?? "", /from:john invoice/);
  assert.deepEqual(proposals[0]?.payload, {
    serverId: "gmail",
    toolName: "search_messages",
    arguments: { query: "from:john invoice" },
  });
});

test("a general 'check my email' with nothing extractable defaults to is:unread", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    mcp: fakeMcpToolLister({ gmail: [SEARCH_TOOL] }),
    router: fakeRouter({ completeReturns: "is:unread" }),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: "No unread emails." };
    },
  });

  await skill.handle({ utterance: "check my email", intent: "check_email", sessionId: "s1" }, ctx);

  assert.deepEqual((proposals[0]?.payload as { arguments: Record<string, string> }).arguments, { query: "is:unread" });
});

test("owner rejects: says so, not a false success", async () => {
  const ctx = fakeSkillContext({
    mcp: fakeMcpToolLister({ gmail: [SEARCH_TOOL] }),
    router: fakeRouter({ completeReturns: "is:unread" }),
    propose: async () => ({ ok: false, reason: "rejected" }),
  });

  const result = await skill.handle({ utterance: "check my email", intent: "check_email", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Okay, didn't check your email.");
});

test("a real MCP/tool failure is reported, not swallowed", async () => {
  const ctx = fakeSkillContext({
    mcp: fakeMcpToolLister({ gmail: [SEARCH_TOOL] }),
    router: fakeRouter({ completeReturns: "is:unread" }),
    propose: async () => ({ ok: false, reason: "error", detail: "token expired" }),
  });

  const result = await skill.handle({ utterance: "check my email", intent: "check_email", sessionId: "s1" }, ctx);

  assert.match(result.speech, /token expired/);
});

test("findSearchTool matches by name or description, case-insensitively", () => {
  assert.equal(findSearchTool([{ name: "search_messages" }])?.name, "search_messages");
  assert.equal(findSearchTool([{ name: "gmail_list_threads" }])?.name, "gmail_list_threads");
  assert.equal(findSearchTool([{ name: "x", description: "Query the inbox" }])?.name, "x");
  assert.equal(findSearchTool([{ name: "get_profile" }]), null);
});

test("guessQueryArgName prefers the single required string property", () => {
  const name = guessQueryArgName({ type: "object", properties: { q: { type: "string" }, limit: { type: "number" } }, required: ["q"] });
  assert.equal(name, "q");
});

test("guessQueryArgName falls back to a conventional name when nothing else disambiguates", () => {
  const name = guessQueryArgName({
    type: "object",
    properties: { query: { type: "string" }, extra: { type: "string" } },
  });
  assert.equal(name, "query");
});

test("guessQueryArgName returns null rather than guess when the schema is genuinely ambiguous", () => {
  assert.equal(
    guessQueryArgName({ type: "object", properties: { a: { type: "string" }, b: { type: "string" } } }),
    null,
  );
  assert.equal(guessQueryArgName(undefined), null);
});
