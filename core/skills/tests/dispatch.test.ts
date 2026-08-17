import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatChunk, ChatRequest } from "../../../shared/types.ts";
import type { ModelProvider } from "../../router/provider.ts";
import { Registry } from "../../router/registry.ts";
import { orthogonalVector, ScriptedEmbedder } from "../../memory/tests/fakes.ts";
import { dispatch } from "../dispatch.ts";
import type { Skill, SkillContext } from "../types.ts";

/** Returns different scripted JSON depending on whether it's the lane
 * classifier's prompt or the disambiguation prompt -- distinguishable by
 * whether "Candidates:" (the disambiguation prompt's own marker) is
 * present in the user message. */
class ScriptedRouterProvider implements ModelProvider {
  readonly id: string;
  readonly lanes = ["converse"] as const;
  readonly costTier = "free-local" as const;
  disambiguationCalls = 0;
  private readonly disambiguationChoice: string;

  /** `id` defaults to a plain fixture id; pass `"ollama"` to simulate the
   * true last-resort provider answering, for the "peanuts" fix's own
   * test below (dispatch.ts checks this exact string, matching
   * laneClassifier.ts's identical ADR-040 check). */
  constructor(disambiguationChoice: string, id = "scripted") {
    this.disambiguationChoice = disambiguationChoice;
    this.id = id;
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const userText = req.messages[req.messages.length - 1]?.content ?? "";
    if (userText.includes("Candidates:")) {
      this.disambiguationCalls += 1;
      yield { delta: JSON.stringify({ choice: this.disambiguationChoice }), done: true };
    } else {
      yield { delta: JSON.stringify({ lane: "converse" }), done: true };
    }
  }

  async health() {
    return { ok: true };
  }
}

function skillFixture(id: string, intentIds: string[]): Skill {
  return {
    manifest: {
      id,
      version: "1.0.0",
      description: "fixture",
      intents: intentIds.map((i) => ({ id: i, description: "d", examples: [`${id} ${i} example`], lanes: ["converse"] })),
      capabilities: [],
    },
    async handle() {
      return { speech: `handled by ${id}` };
    },
  };
}

function buildContext(): SkillContext {
  return {
    router: { complete: async () => "", see: async () => { throw new Error("not used"); } },
    memory: undefined as never,
    camera: { state: "idle", async open() { throw new Error("not used"); } },
    propose: async () => ({ ok: false, reason: "rejected" }),
    say: () => {},
    ask: async () => "",
    store: { exec: () => {}, get: () => undefined, all: () => [], run: () => {} },
    sessionId: "s1",
    now: () => 0,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    mcp: { hasServer: () => false, listTools: () => [] },
    fs: { listDir: () => { throw new Error("not used"); }, readFile: () => { throw new Error("not used"); } },
  };
}

test("confident match dispatches directly, without a disambiguation call", async () => {
  const target = skillFixture("brief", ["morning"]);
  const skillsById = new Map([[target.manifest.id, target]]);
  const embedder = new ScriptedEmbedder(
    new Map([
      ["brief morning example", orthogonalVector(0)],
      ["good morning", orthogonalVector(0)], // identical -> score 1.0
    ]),
  );
  const exampleIndex = [{ skillId: "brief", intentId: "morning", example: "brief morning example", vector: orthogonalVector(0) }];
  const provider = new ScriptedRouterProvider("brief.morning");
  const routerRegistry = new Registry();
  routerRegistry.register(provider, ["converse"]);

  const { outcome, trace } = await dispatch(
    { skillsById, exampleIndex, routerRegistry, buildContext: () => buildContext() },
    embedder,
    "good morning",
    "s1",
  );

  assert.equal(outcome.outcome, "dispatched");
  if (outcome.outcome === "dispatched") assert.equal(outcome.result.speech, "handled by brief");
  assert.equal(trace.disambiguated, false);
  assert.equal(provider.disambiguationCalls, 0);
});

test("ambiguous scores trigger disambiguation, which picks from the shortlist", async () => {
  const skillA = skillFixture("a", ["x"]);
  const skillB = skillFixture("b", ["y"]);
  const skillsById = new Map([
    [skillA.manifest.id, skillA],
    [skillB.manifest.id, skillB],
  ]);
  // Both examples close-ish to the utterance and to each other -- neither
  // clears DISPATCH_SCORE/DISPATCH_MARGIN alone.
  const v1 = [1, 0.3, 0];
  const v2 = [1, 0.35, 0];
  const embedder = new ScriptedEmbedder(
    new Map([
      ["a x example", v1],
      ["b y example", v2],
      ["ambiguous utterance", v1],
    ]),
  );
  const exampleIndex = [
    { skillId: "a", intentId: "x", example: "a x example", vector: v1 },
    { skillId: "b", intentId: "y", example: "b y example", vector: v2 },
  ];
  const provider = new ScriptedRouterProvider("b.y");
  const routerRegistry = new Registry();
  routerRegistry.register(provider, ["converse"]);

  const { outcome, trace } = await dispatch(
    { skillsById, exampleIndex, routerRegistry, buildContext: () => buildContext() },
    embedder,
    "ambiguous utterance",
    "s1",
  );

  assert.equal(trace.disambiguated, true);
  assert.equal(provider.disambiguationCalls, 1);
  assert.equal(outcome.outcome, "dispatched");
  if (outcome.outcome === "dispatched") assert.equal(outcome.result.speech, "handled by b");
});

test("the 'peanuts' bug (ADR-038): the true last-resort provider's disambiguation choice is never trusted", async () => {
  // Same shape as the "ambiguous scores" test above, except the
  // provider that answers disambiguation is "ollama" (the true last
  // resort) -- live-verified (ADR-038) to answer within budget but pick
  // *wrong* on self-referential fact statements, 42.9% on a degraded-
  // mode benchmark. Even though this fake scripts it to confidently
  // choose "b.y", dispatch() must not trust that choice from this
  // specific provider -- the fix is provider-aware, not prompt-aware.
  const skillA = skillFixture("a", ["x"]);
  const skillB = skillFixture("b", ["y"]);
  const skillsById = new Map([
    [skillA.manifest.id, skillA],
    [skillB.manifest.id, skillB],
  ]);
  const v1 = [1, 0.3, 0];
  const v2 = [1, 0.35, 0];
  const embedder = new ScriptedEmbedder(
    new Map([
      ["a x example", v1],
      ["b y example", v2],
      ["ambiguous utterance", v1],
    ]),
  );
  const exampleIndex = [
    { skillId: "a", intentId: "x", example: "a x example", vector: v1 },
    { skillId: "b", intentId: "y", example: "b y example", vector: v2 },
  ];
  const provider = new ScriptedRouterProvider("b.y", "ollama");
  const routerRegistry = new Registry();
  routerRegistry.register(provider, ["converse"]);

  const { outcome, trace } = await dispatch(
    { skillsById, exampleIndex, routerRegistry, buildContext: () => buildContext() },
    embedder,
    "ambiguous utterance",
    "s1",
  );

  assert.equal(trace.disambiguated, true, "a disambiguation call did happen");
  assert.equal(provider.disambiguationCalls, 1);
  assert.equal(outcome.outcome, "no_skill_matched", "its answer must be ignored, not trusted");
});

test("nothing above the candidate floor: no skill matched, no disambiguation call", async () => {
  const target = skillFixture("brief", ["morning"]);
  const skillsById = new Map([[target.manifest.id, target]]);
  const embedder = new ScriptedEmbedder(
    new Map([
      ["brief morning example", orthogonalVector(0)],
      ["completely unrelated", orthogonalVector(7)],
    ]),
  );
  const exampleIndex = [{ skillId: "brief", intentId: "morning", example: "brief morning example", vector: orthogonalVector(0) }];
  const provider = new ScriptedRouterProvider("brief.morning");
  const routerRegistry = new Registry();
  routerRegistry.register(provider, ["converse"]);

  const { outcome, trace } = await dispatch(
    { skillsById, exampleIndex, routerRegistry, buildContext: () => buildContext() },
    embedder,
    "completely unrelated",
    "s1",
  );

  assert.equal(outcome.outcome, "no_skill_matched");
  assert.equal(trace.disambiguated, false);
  assert.equal(provider.disambiguationCalls, 0);
});

test("an intent whose lanes don't include the classified lane is excluded from candidates", async () => {
  const target: Skill = {
    manifest: {
      id: "act_only",
      version: "1.0.0",
      description: "fixture",
      intents: [{ id: "i", description: "d", examples: ["identical text"], lanes: ["act"] }], // not converse
      capabilities: [],
    },
    async handle() {
      return { speech: "should not be reached" };
    },
  };
  const skillsById = new Map([[target.manifest.id, target]]);
  const embedder = new ScriptedEmbedder(
    new Map([
      ["identical text", orthogonalVector(0)],
      ["utterance", orthogonalVector(0)],
    ]),
  );
  const exampleIndex = [{ skillId: "act_only", intentId: "i", example: "identical text", vector: orthogonalVector(0) }];
  const provider = new ScriptedRouterProvider("act_only.i");
  const routerRegistry = new Registry();
  routerRegistry.register(provider, ["converse"]);

  const { outcome, trace } = await dispatch(
    { skillsById, exampleIndex, routerRegistry, buildContext: () => buildContext() },
    embedder,
    "utterance",
    "s1",
  );

  assert.equal(outcome.outcome, "no_skill_matched");
  assert.equal(trace.candidates.length, 0);
});
