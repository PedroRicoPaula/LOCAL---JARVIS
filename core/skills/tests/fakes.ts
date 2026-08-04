/**
 * core/skills/tests/fakes.ts — no network, no models, no camera, no
 * database file (docs/SKILLS.md § 7). Every skill test and every skill
 * host test builds its context from here.
 */

import type { VisionRequest, VisionResult } from "../../../shared/types.ts";
import type { Conversation, Logger, Router, SkillContext, SkillStore } from "../types.ts";

export interface FakeRouterScript {
  completeReturns?: string | ((lane: string, system: string, userText: string) => string);
  completeThrows?: Error;
  seeReturns?: VisionResult;
}

export function fakeRouter(script: FakeRouterScript = {}): Router & { calls: { system: string; userText: string }[] } {
  const calls: { system: string; userText: string }[] = [];
  return {
    calls,
    async complete(_lane, system, userText): Promise<string> {
      calls.push({ system, userText });
      if (script.completeThrows) throw script.completeThrows;
      if (typeof script.completeReturns === "function") return script.completeReturns(_lane, system, userText);
      return script.completeReturns ?? "";
    },
    async see(_req: VisionRequest): Promise<VisionResult> {
      if (script.seeReturns) return script.seeReturns;
      throw new Error("fakeRouter: no seeReturns scripted");
    },
  };
}

export function fakeConversation(answers: readonly string[] = []): Conversation & { said: string[] } {
  const said: string[] = [];
  const queue = [...answers];
  return {
    said,
    say(text: string): void {
      said.push(text);
    },
    async ask(): Promise<string> {
      const next = queue.shift();
      if (next === undefined) throw new Error("fakeConversation: ran out of scripted answers");
      return next;
    },
  };
}

export function fakeStore(): SkillStore {
  const tables = new Map<string, unknown[]>();
  void tables; // intentionally unused beyond presence -- most skill tests don't need real persistence
  return {
    exec: () => {},
    get: () => undefined,
    all: () => [],
    run: () => {},
  };
}

export function fakeLogger(): Logger {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

export interface FakeContextOptions {
  router?: Router;
  memory?: SkillContext["memory"];
  conversation?: Conversation;
  propose?: SkillContext["propose"];
  store?: SkillStore;
  sessionId?: string;
}

export function fakeSkillContext(opts: FakeContextOptions = {}): SkillContext {
  const conversation = opts.conversation ?? fakeConversation();
  return {
    router: opts.router ?? fakeRouter(),
    memory: opts.memory as SkillContext["memory"],
    camera: {
      state: "idle",
      async open() {
        throw new Error("fake: camera not available in this test");
      },
    },
    propose: opts.propose ?? (async () => ({ ok: false, reason: "rejected" })),
    say: conversation.say,
    ask: conversation.ask,
    store: opts.store ?? fakeStore(),
    sessionId: opts.sessionId ?? "test-session",
    now: () => 0,
    log: fakeLogger(),
  };
}
