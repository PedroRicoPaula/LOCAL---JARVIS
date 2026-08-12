/**
 * core/skills/tests/fakes.ts — no network, no models, no camera, no
 * database file (docs/SKILLS.md § 7). Every skill test and every skill
 * host test builds its context from here.
 */

import type { CameraHandle, CameraSession, Frame, VisionRequest, VisionResult } from "../../../shared/types.ts";
import type { McpToolInfo, McpToolLister } from "../../mcp/registry.ts";
import { createGatedFs } from "../fs.ts";
import { createEmptyMcpToolLister } from "../mcp.ts";
import type { Conversation, Logger, Router, SkillContext, SkillStore } from "../types.ts";

export interface FakeRouterScript {
  completeReturns?: string | ((lane: string, system: string, userText: string) => string);
  completeThrows?: Error;
  seeReturns?: VisionResult;
  seeThrows?: Error;
  /** Which provider "served" `seeReturns` -- defaults to a fixed fake id,
   * override when a test cares (e.g. an `Observation.provider` assertion). */
  seeProvider?: string;
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
    async see(_req: VisionRequest): Promise<VisionResult & { provider: string }> {
      if (script.seeThrows) throw script.seeThrows;
      if (script.seeReturns) return { ...script.seeReturns, provider: script.seeProvider ?? "fake-provider" };
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

/** A working camera, scripted with the frames `capture()` should hand
 * back in order (last one repeats once exhausted, same "repeat the
 * last, most tests just care that a call happened" convention
 * `senses/eyes/fakes.py`'s own `FakeCameraDevice` already uses). Real
 * enough for a skill test to exercise open -> capture -> close without
 * a real device or socket -- `docs/SKILLS.md` § 7's own worked example
 * names this exact helper. */
export function fakeCamera(
  frames: readonly Frame[],
): CameraHandle & { closedSessionIds: string[]; gestureCalls: string[] } {
  let state: CameraHandle["state"] = "idle";
  let captureCount = 0;
  const closedSessionIds: string[] = [];
  const gestureCalls: string[] = [];

  return {
    get state(): CameraHandle["state"] {
      return state;
    },
    closedSessionIds,
    gestureCalls,
    async open(reason: string): Promise<CameraSession> {
      state = "armed";
      const id = "fake-session";
      const openedAt = 0;
      return {
        id,
        openedAt,
        expiresAt: openedAt + 600_000,
        idleUntil: openedAt + 120_000,
        reason,
        async capture(): Promise<Frame> {
          if (frames.length === 0) throw new Error("fakeCamera: no frames scripted");
          const frame = frames[Math.min(captureCount, frames.length - 1)]!;
          captureCount += 1;
          return frame;
        },
        async close(): Promise<void> {
          state = "idle";
          closedSessionIds.push(id);
        },
        startGestures(): void {
          gestureCalls.push("start");
        },
        stopGestures(): void {
          gestureCalls.push("stop");
        },
      };
    },
  };
}

/** Simulates a specific server's discovered tools -- for skills whose
 * behavior depends on what `ctx.mcp.listTools()` returns (e.g.
 * `skills/gmail`, which finds a tool by name pattern rather than
 * assuming an exact, unverified server-side tool name). */
export function fakeMcpToolLister(toolsByServer: Record<string, McpToolInfo[]> = {}): McpToolLister {
  return {
    hasServer: (serverId) => serverId in toolsByServer,
    listTools: (serverId) => toolsByServer[serverId] ?? [],
  };
}

export interface FakeContextOptions {
  router?: Router;
  memory?: SkillContext["memory"];
  conversation?: Conversation;
  propose?: SkillContext["propose"];
  store?: SkillStore;
  sessionId?: string;
  mcp?: McpToolLister;
  /** Real roots `ctx.fs` may access -- defaults to none (an honest,
   * always-denying accessor), same "no real access unless explicitly
   * configured" default `buildSkillContext` itself uses. */
  fsRoots?: readonly string[];
  /** Defaults to a handle whose `open()` always throws -- same "no real
   * access unless explicitly configured" default every other optional
   * dependency here uses. Pass `fakeCamera([...])` for a skill under
   * test that declares `CAMERA`. */
  camera?: CameraHandle;
}

export function fakeSkillContext(opts: FakeContextOptions = {}): SkillContext {
  const conversation = opts.conversation ?? fakeConversation();
  return {
    router: opts.router ?? fakeRouter(),
    memory: opts.memory as SkillContext["memory"],
    camera: opts.camera ?? {
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
    mcp: opts.mcp ?? createEmptyMcpToolLister(),
    fs: createGatedFs(opts.fsRoots ?? []),
  };
}
