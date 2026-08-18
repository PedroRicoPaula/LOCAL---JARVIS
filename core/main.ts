/**
 * core/main.ts — the real `core`: connects out to `senses/ears` and
 * `senses/voice` (both servers, per `senses/ipc.py`'s own docstring plan
 * — "whoever orchestrates them ... core/ from Phase 3 on"), dispatches
 * every utterance through the skill host (Phase 5), falls back to general
 * conversation (`converse.ts`) when nothing matches, and remembers both
 * halves of the exchange (Phase 4) — the first thing in this project that
 * actually writes real conversation history, not synthetic or fixture
 * data.
 *
 * Replaces `senses/echo_bridge.py`, which was always documented as a
 * Phase-1-only stand-in for exactly this position. `ears`/`voice` don't
 * change: they only know "read from my socket" / "write to my socket,"
 * never that the bridge (echo, then this) exists.
 *
 * Not unit-tested itself, same convention as `senses/ears/main.py`/
 * `senses/voice/main.py` — it's wiring, proven live (`make dev` +
 * acoustic loopback), not logic worth a fake-based test. The logic it
 * wires together (`dispatch`, `generalConversationReply`,
 * `createIpcConversation`, `Memory`, `extractAndRememberFacts`) all has
 * its own tests.
 */

import { connectWithRetry } from "./ipc.ts";
import { relayCameraStatus, relayVoiceStatus } from "./senseRelays.ts";
import { wrapSenseConnection, type SenseConnection } from "./senseConnection.ts";
import { createIpcCameraHandle, restrictPointerControl } from "./skills/camera.ts";
import { generalConversationReply } from "./converse.ts";
import { createDashboardHistory } from "./dashboardHistory.ts";
import { runAppControlAction } from "./executors/appControl.ts";
import { runRemindersAction } from "./executors/reminders.ts";
import { createMcpToolExecutor } from "./executors/mcp.ts";
import { createWriteFactExecutor } from "./executors/memory.ts";
import { runShellAction } from "./executors/shell.ts";
import { extractAndRememberFacts } from "./factExtraction.ts";
import { createFactExtractionScheduler } from "./factExtractionScheduler.ts";
import { watchApprovalCommands } from "./gate/cli.ts";
import { Gate } from "./gate/gate.ts";
import { getSigningKey } from "./gate/hmac.ts";
import { createHttpServer } from "./http.ts";
import { setupMcpRegistry } from "./mcp/setup.ts";
import { openDb } from "./memory/db.ts";
import { Memory } from "./memory/memory.ts";
import { OllamaProvider } from "./router/providers/ollama.ts";
import { buildRegistry } from "./router/wiring.ts";
import { buildSkillContext } from "./skills/context.ts";
import { AskCancelledError } from "./skills/conversation/cancel.ts";
import { createIpcConversation } from "./skills/conversation/ipc.ts";
import { SkillRegistry } from "./skills/registry.ts";
import { createSkillStore } from "./skills/store.ts";
import { createWsHub } from "./ws.ts";
// The one real FS_READ root today -- imported from the skill that
// actually needs it (not duplicated as a second constant here), wired
// into every skill's context uniformly since `ctx.fs` itself is what
// enforces the real boundary, same as `ctx.mcp`/`ctx.camera` are always
// present regardless of which skill declared the matching capability.
import { PROJECTS_ROOT } from "../skills/launcher/index.ts";

const EARS_SOCKET = process.env["JARVIS_EARS_SOCKET"] ?? "/tmp/jarvis-ears.sock";
const VOICE_SOCKET = process.env["JARVIS_VOICE_SOCKET"] ?? "/tmp/jarvis-voice.sock";
const EYES_SOCKET = process.env["JARVIS_EYES_SOCKET"] ?? "/tmp/jarvis-eyes.sock";
const DB_PATH = process.env["JARVIS_DB_PATH"] ?? "data/jarvis.db";
const DASHBOARD_PORT = Number(process.env["JARVIS_DASHBOARD_PORT"] ?? 8787);

// One long-lived session per `core` run. Real multi-session tracking
// (new session on wake after a gap, etc.) isn't needed by anything built
// so far -- `Memory.recentEventsForSession` and `SkillContext.sessionId`
// just need *a* stable id to group a run's conversation under.
const SESSION_ID = "default";

async function main(): Promise<void> {
  // `wsHub` doesn't exist yet at connect time (it needs `gate`/`memory`,
  // built further down), so each sense's `onStateChange` is a tiny
  // indirection cell filled in once `wsHub` is real -- same "forward
  // reference, assigned later, only ever called after" shape
  // `handleUtterance` below already uses.
  let broadcastSenseState: (sense: "ears" | "voice" | "eyes", connected: boolean) => void = () => {};

  console.log(`core: connecting to ears (${EARS_SOCKET})`);
  const earsConn = wrapSenseConnection("ears", EARS_SOCKET, await connectWithRetry(EARS_SOCKET), (c) => broadcastSenseState("ears", c));
  console.log(`core: connecting to voice (${VOICE_SOCKET})`);
  const voiceConn = wrapSenseConnection("voice", VOICE_SOCKET, await connectWithRetry(VOICE_SOCKET), (c) => broadcastSenseState("voice", c));
  console.log("core: connected to both.");

  // eyes is on-demand (SPEC.md § 2: "launchd, idle"), not always-running
  // like ears/voice -- unlike those two, a failure to connect here must
  // not stop `core` from booting. A camera-declaring skill fails
  // honestly (the same stub message it always gave before Phase 8)
  // rather than the whole assistant refusing to start over one unused
  // sense. A handful of quick attempts, not the full ears/voice retry
  // budget -- if eyes genuinely isn't running, waiting longer just
  // delays boot for no benefit. Once connected, though, it gets the same
  // reconnect-on-drop treatment as ears/voice -- a camera skill that
  // worked five minutes ago shouldn't silently stop working forever
  // after one `eyes` hiccup.
  console.log(`core: connecting to eyes (${EYES_SOCKET})`);
  let eyesConn: SenseConnection | undefined;
  try {
    const initialEyesSock = await connectWithRetry(EYES_SOCKET, 3, 500);
    eyesConn = wrapSenseConnection("eyes", EYES_SOCKET, initialEyesSock, (c) => broadcastSenseState("eyes", c));
    console.log("core: connected to eyes.");
  } catch (err) {
    console.warn(`core: eyes not available (${err instanceof Error ? err.message : String(err)}) -- camera-declaring skills will fail honestly until it's running`);
  }

  const embedder = new OllamaProvider({ models: {}, embedModel: "mxbai-embed-large" });
  const db = openDb(DB_PATH);
  const memory = new Memory(db, embedder);
  const routerRegistry = await buildRegistry();
  const mcpRegistry = await setupMcpRegistry();
  const gate = new Gate(db, await getSigningKey(), {
    SHELL_EXEC: runShellAction,
    APP_CONTROL: runAppControlAction,
    REMINDERS: runRemindersAction,
    MEMORY_WRITE: createWriteFactExecutor(memory),
    MCP_TOOL_CALL: createMcpToolExecutor(mcpRegistry),
  });

  const skillRegistry = new SkillRegistry();
  const loadReport = await skillRegistry.loadAll(
    (skillId) => ({
      memory,
      store: createSkillStore(db, skillId),
      log: { info: console.log, warn: console.warn, error: console.error },
    }),
    embedder,
  );
  console.log("core: skills loaded:", loadReport.loaded, "-- disabled:", loadReport.disabled);

  const conversation = createIpcConversation((text) => voiceConn.send({ type: "speak", text }));

  // Only constructed when eyes is actually connected -- `undefined`
  // means every camera-declaring skill's `ctx.camera` falls back to the
  // honest throwing stub (`buildSkillContext`'s own `deps.camera ??
  // createStubCameraHandle()`), same shape as the four optional keys in
  // `router/wiring.ts`.
  const cameraHandle = eyesConn ? createIpcCameraHandle((message) => eyesConn!.send(message)) : undefined;

  // Forward reference: `wsHub` needs `onUtterance` to wire the dashboard's
  // test console (SOAK 1) before `handleUtterance` itself can be defined
  // (it broadcasts through `wsHub`). Assigned below, only ever *called*
  // once the real handler exists -- same pattern as any event-emitter
  // listener registered before its handler body is filled in.
  let handleUtterance: (text: string) => Promise<void>;

  // The dashboard (Phase 7): one HTTP server for historical queries
  // (`/api/events`, `/api/skills`) with a WebSocket upgraded on top of it
  // for the live channel, so both share one port. `wsHub` is also how
  // `Gate`'s "approval.new"/"approval.resolved" events (SPEC.md § 8: "the
  // dashboard is a view, never an authority") reach a browser.
  const history = createDashboardHistory();
  const httpServer = createHttpServer(memory, skillRegistry, gate, history, db);
  const wsHub = createWsHub(
    httpServer,
    gate,
    memory,
    (text) => {
      handleUtterance(text).catch((err) => console.error("core: injected utterance failed, continuing", err));
    },
    (enabled) => {
      eyesConn?.send({ type: "gesture.blur", enabled });
    },
  );
  // "127.0.0.1", not omitted -- found live in a security review (2026-08-06):
  // omitting the host makes Node bind every interface, not loopback only,
  // so anything on the same LAN could reach the dashboard API/WebSocket.
  // See core/http.ts's `ALLOWED_ORIGIN` and core/ws.ts's `verifyClient` for
  // the matching origin checks this alone doesn't replace.
  await new Promise<void>((resolve) => httpServer.listen(DASHBOARD_PORT, "127.0.0.1", resolve));
  console.log(`core: dashboard listening on :${DASHBOARD_PORT}`);

  // Now that `wsHub` is real, wire the forward reference declared at the
  // top of this function -- every reconnect/disconnect from here on is
  // dashboard-visible, not just a console log (found live, 2026-08-07:
  // it previously wasn't, at all -- see `senseConnection.ts`'s docstring).
  broadcastSenseState = (sense, connected) => wsHub.broadcast({ type: "sense.connection", sense, connected });

  // Concurrent with the ears loop below, not before/after it -- until
  // Phase 7's dashboard exists, typing into this same terminal is the
  // only way to answer a pending approval (see gate/cli.ts's docstring).
  watchApprovalCommands(gate).catch((err) => console.error("core: approval command reader failed", err));

  // `voice` now reports real speaking start/stop (SayBackend.speak blocks
  // for the actual audio duration -- see senses/voice/main.py) -- relayed
  // as-is so the dashboard shows genuine progress, not a guess.
  relayVoiceStatus(voiceConn, wsHub).catch((err) => console.error("core: voice status relay failed", err));

  // Same relay shape as voice, but doubles as the wire that resolves
  // `cameraHandle`'s own pending request/reply correlation (offerEvent)
  // -- one socket, one reader, two jobs, since eyes multiplexes replies
  // and self-triggered timeout events on the same connection. Only
  // started when eyes actually connected.
  if (eyesConn && cameraHandle) {
    relayCameraStatus(eyesConn, wsHub, cameraHandle, conversation.say, memory, SESSION_ID).catch((err) =>
      console.error("core: camera status relay failed", err),
    );
  }

  // Batched, idle-triggered fact extraction (core/factExtractionScheduler.ts)
  // -- replaces the old one-extraction-call-per-utterance shape, found
  // live to both cost more (an LLM call every turn) and produce worse,
  // noisier facts (isolated fragments judged with no surrounding
  // context). Still fire-and-forget from handleUtterance's own
  // perspective -- onUtterance() only buffers, the real extraction call
  // happens later, off this turn's critical path either way.
  const factExtractionScheduler = createFactExtractionScheduler((batch) => {
    extractAndRememberFacts(routerRegistry, gate, batch).catch((err) => {
      console.error("core: fact extraction failed, continuing", err);
    });
  });

  // The single utterance-handling path -- real speech from `ears` and a
  // dashboard test-console line (SOAK 1, `ClientEvent` "utterance.inject")
  // both end up here, and `core` cannot tell them apart once they do.
  // That's deliberate: it's what makes the dashboard console a source of
  // real usage data, not a separate toy path.
  handleUtterance = async (text: string): Promise<void> => {
    // An answer to a skill's ctx.ask(), not a new top-level utterance.
    if (conversation.offerUtterance(text)) return;

    console.log(`core: heard ${JSON.stringify(text)}`);
    const utteranceEvent = memory.appendEvent({ kind: "utterance", actor: "owner", content: text, sessionId: SESSION_ID });
    // Fire-and-forget, same reasoning as extractAndRememberFacts below:
    // indexing this turn only matters for a *future* turn's recall, so
    // it must never delay today's response (CLAUDE.md § 7). Found live,
    // SOAK 1 -- this call was missing entirely before, so real
    // conversation was never actually indexed for semantic/keyword
    // recall at all (see Memory.indexEvent's own docstring).
    memory.indexEvent(utteranceEvent).catch((err) => console.error("core: failed to index utterance for recall, continuing", err));
    wsHub.broadcast({ type: "transcript", text, final: true, speaker: "owner", eventId: utteranceEvent.id });
    wsHub.broadcast({ type: "state", value: "thinking" });
    try {
      // Buffered, not extracted immediately -- see factExtractionScheduler
      // above for why.
      factExtractionScheduler.onUtterance({ text, eventId: utteranceEvent.id });

      const { outcome, trace } = await skillRegistry.dispatch(
        embedder,
        routerRegistry,
        text,
        SESSION_ID,
        (skillId) => {
          // Capability enforcement happens at the handle, not the call
          // site (docs/SKILLS.md § 4) -- but *which* handle a skill gets
          // is decided right here: only a skill whose own manifest
          // declares CAMERA, and only when eyes is actually connected,
          // gets the real one. Every other skill gets `undefined`,
          // which `buildSkillContext` turns into the honest throwing
          // stub on its own. POINTER_CONTROL is a second, narrower gate
          // on top of CAMERA (security review, 2026-08-13) -- a skill
          // can have a working camera without also being able to drive
          // the real cursor.
          const skill = skillRegistry.get(skillId);
          const hasCamera = cameraHandle && skill?.manifest.capabilities.includes("CAMERA");
          const camera = hasCamera
            ? skill?.manifest.capabilities.includes("POINTER_CONTROL")
              ? cameraHandle
              : restrictPointerControl(cameraHandle)
            : undefined;
          return buildSkillContext(
            { db, memory, routerRegistry, conversation, gate, mcp: mcpRegistry, fsRoots: [PROJECTS_ROOT], ...(camera ? { camera } : {}) },
            skillId,
            SESSION_ID,
          );
        },
      );
      memory.recordRoutingStat({
        lane: trace.lane,
        skillId: trace.chosen?.skillId ?? null,
        intentId: trace.chosen?.intentId ?? null,
        matched: trace.chosen !== undefined,
        eventId: utteranceEvent.id,
      });
      const thoughtEvent = {
        type: "thought" as const,
        lane: trace.lane,
        ts: Date.now(),
        text: trace.chosen
          ? `${trace.lane}: dispatched ${trace.chosen.skillId}.${trace.chosen.intentId}${trace.disambiguated ? " (disambiguated)" : ""}`
          : `${trace.lane}: no skill matched, falling back to general conversation`,
      };
      wsHub.broadcast(thoughtEvent);
      history.recordThought(thoughtEvent);

      let speech: string;
      if (outcome.outcome === "dispatched") {
        // The skill already called ctx.say() itself -- don't speak again.
        speech = outcome.result.speech;
      } else {
        // Each sentence is spoken the moment it completes, not after the
        // whole reply is assembled -- CLAUDE.md § 7's own rule, measured
        // as ~1.9s per turn of avoidable waiting before this changed
        // (see `converse.ts`'s docstring and `bench/bench_latency.ts`).
        speech = await generalConversationReply(
          routerRegistry,
          memory,
          text,
          SESSION_ID,
          skillRegistry.list().map((s) => s.manifest.id),
          (sentence) => conversation.say(sentence),
        );
      }
      console.log(`core: said ${JSON.stringify(speech)}`);
      const responseEvent = memory.appendEvent({ kind: "response", actor: "jarvis", content: speech, sessionId: SESSION_ID });
      memory.indexEvent(responseEvent).catch((err) => console.error("core: failed to index response for recall, continuing", err));
      wsHub.broadcast({ type: "transcript", text: speech, final: true, speaker: "jarvis", eventId: responseEvent.id });
    } catch (err) {
      // A cancellation is not a failure. The owner said "stop" while a
      // skill was waiting on ctx.ask(); reporting that as "something
      // went wrong" would be its own small dishonesty (CLAUDE.md § 6),
      // and it must not land in the error log either. Speak a short
      // acknowledgement, record it as a normal response, and move on.
      if (err instanceof AskCancelledError) {
        console.log("core: owner cancelled a pending question");
        const cancelled = "Cancelled.";
        conversation.say(cancelled);
        const cancelEvent = memory.appendEvent({ kind: "response", actor: "jarvis", content: cancelled, sessionId: SESSION_ID });
        wsHub.broadcast({ type: "transcript", text: cancelled, final: true, speaker: "jarvis", eventId: cancelEvent.id });
        return;
      }
      // One bad utterance (a skill bug, a model failure) must not take
      // the whole process down -- same "supervisor boundary" reasoning
      // as senses/ears/main.py's safe_run(). But CLAUDE.md § 6's honesty
      // rule doesn't stop at logs: silence here would be its own kind of
      // lie ("everything's fine") -- the owner gets told, spoken and on
      // the dashboard, not just the terminal.
      console.error("core: failed to handle utterance, continuing", err);
      const message = err instanceof Error ? err.message : String(err);
      const errorEvent = { type: "error" as const, message: "Something went wrong handling that.", detail: message, ts: Date.now() };
      wsHub.broadcast(errorEvent);
      history.recordError(errorEvent);
      const fallback = "Something went wrong handling that. I've logged the error.";
      conversation.say(fallback);
      // Durable, not just a live WS broadcast -- found live, 2026-08-06:
      // a real ctx.ask() timeout left no trace at all in /api/events,
      // only in the ephemeral WS stream a connected tab happened to
      // catch. A turn that failed is still part of the conversation
      // history; hiding it from a later dashboard reload/query is its
      // own kind of dishonesty (CLAUDE.md § 6).
      const fallbackEvent = memory.appendEvent({ kind: "response", actor: "jarvis", content: fallback, sessionId: SESSION_ID });
      wsHub.broadcast({ type: "transcript", text: fallback, final: true, speaker: "jarvis", eventId: fallbackEvent.id });
    } finally {
      wsHub.broadcast({ type: "state", value: "idle" });
    }
  };

  console.log("core: ready.");
  for await (const message of earsConn.messages()) {
    if (message["type"] === "audio.level") {
      wsHub.broadcast({ type: "audio.level", level: Number(message["level"]) });
      continue;
    }
    if (message["type"] === "listening") {
      wsHub.broadcast({ type: "state", value: "listening" });
      continue;
    }
    if (message["type"] !== "utterance") continue;
    const text = String(message["text"] ?? "").trim();
    if (!text) continue;
    await handleUtterance(text);
  }
}

main().catch((err) => {
  console.error("core: fatal error", err);
  process.exit(1);
});
