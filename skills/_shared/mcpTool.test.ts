import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeConversation, fakeMcpToolLister, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import type { ProposedAction } from "../../shared/types.ts";
import { proposeMcpTool, requireMcpServer } from "./mcpTool.ts";

const MESSAGES = {
  rejected: "okay, never mind",
  expired: "that request expired",
  error: (detail: string) => `something broke: ${detail}`,
};

test("requireMcpServer: connected server returns true, says nothing", () => {
  const conversation = fakeConversation();
  const ctx = fakeSkillContext({ conversation, mcp: fakeMcpToolLister({ github: [] }) });

  const result = requireMcpServer(ctx, "github", "not connected");

  assert.equal(result, true);
  assert.deepEqual(conversation.said, []);
});

test("requireMcpServer: unconnected server returns false and speaks the given message", () => {
  const conversation = fakeConversation();
  const ctx = fakeSkillContext({ conversation, mcp: fakeMcpToolLister() });

  const result = requireMcpServer(ctx, "github", "not connected");

  assert.equal(result, false);
  assert.deepEqual(conversation.said, ["not connected"]);
});

test("proposeMcpTool: ok outcome runs onSuccess with the real result", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: { count: 3 } };
    },
  });

  const speech = await proposeMcpTool(
    ctx,
    "github",
    "list_repos",
    { owner: "pedro" },
    "List repos",
    (result) => `found ${(result as { count: number }).count}`,
    MESSAGES,
  );

  assert.equal(speech, "found 3");
  assert.deepEqual(proposals, [
    {
      capability: "MCP_TOOL_CALL",
      humanSummary: "List repos",
      payload: { serverId: "github", toolName: "list_repos", arguments: { owner: "pedro" } },
    },
  ]);
});

test("proposeMcpTool: rejected outcome speaks the rejected message, never calls onSuccess", async () => {
  const ctx = fakeSkillContext({ propose: async () => ({ ok: false, reason: "rejected" }) });

  const speech = await proposeMcpTool(
    ctx,
    "github",
    "list_repos",
    {},
    "List repos",
    () => {
      throw new Error("must not run onSuccess on rejection");
    },
    MESSAGES,
  );

  assert.equal(speech, MESSAGES.rejected);
});

test("proposeMcpTool: expired outcome speaks the expired message", async () => {
  const ctx = fakeSkillContext({ propose: async () => ({ ok: false, reason: "expired" }) });

  const speech = await proposeMcpTool(ctx, "github", "list_repos", {}, "List repos", () => "unused", MESSAGES);

  assert.equal(speech, MESSAGES.expired);
});

test("proposeMcpTool: an error outcome passes the real detail through", async () => {
  const ctx = fakeSkillContext({ propose: async () => ({ ok: false, reason: "error", detail: "rate limited" }) });

  const speech = await proposeMcpTool(ctx, "github", "list_repos", {}, "List repos", () => "unused", MESSAGES);

  assert.equal(speech, "something broke: rate limited");
});

test("proposeMcpTool: an error outcome with no detail falls back honestly", async () => {
  const ctx = fakeSkillContext({ propose: async () => ({ ok: false, reason: "error" }) });

  const speech = await proposeMcpTool(ctx, "github", "list_repos", {}, "List repos", () => "unused", MESSAGES);

  assert.equal(speech, "something broke: something went wrong");
});
