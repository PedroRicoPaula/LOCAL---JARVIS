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

import { connectWithRetry, readLines, sendLine } from "./ipc.ts";
import { generalConversationReply } from "./converse.ts";
import { extractAndRememberFacts } from "./factExtraction.ts";
import { openDb } from "./memory/db.ts";
import { Memory } from "./memory/memory.ts";
import { OllamaProvider } from "./router/providers/ollama.ts";
import { buildRegistry } from "./router/wiring.ts";
import { buildSkillContext } from "./skills/context.ts";
import { createIpcConversation } from "./skills/conversation/ipc.ts";
import { SkillRegistry } from "./skills/registry.ts";

const EARS_SOCKET = process.env["JARVIS_EARS_SOCKET"] ?? "/tmp/jarvis-ears.sock";
const VOICE_SOCKET = process.env["JARVIS_VOICE_SOCKET"] ?? "/tmp/jarvis-voice.sock";
const DB_PATH = process.env["JARVIS_DB_PATH"] ?? "data/jarvis.db";

// One long-lived session per `core` run. Real multi-session tracking
// (new session on wake after a gap, etc.) isn't needed by anything built
// so far -- `Memory.recentEventsForSession` and `SkillContext.sessionId`
// just need *a* stable id to group a run's conversation under.
const SESSION_ID = "default";

async function main(): Promise<void> {
  console.log(`core: connecting to ears (${EARS_SOCKET})`);
  const earsSock = await connectWithRetry(EARS_SOCKET);
  console.log(`core: connecting to voice (${VOICE_SOCKET})`);
  const voiceSock = await connectWithRetry(VOICE_SOCKET);
  console.log("core: connected to both.");

  const embedder = new OllamaProvider({ models: {}, embedModel: "mxbai-embed-large" });
  const db = openDb(DB_PATH);
  const memory = new Memory(db, embedder);
  const routerRegistry = await buildRegistry();

  const skillRegistry = new SkillRegistry();
  const loadReport = await skillRegistry.loadAll(
    { memory, store: undefined as never, log: { info: console.log, warn: console.warn, error: console.error } },
    embedder,
  );
  console.log("core: skills loaded:", loadReport.loaded, "-- disabled:", loadReport.disabled);

  const conversation = createIpcConversation((text) => sendLine(voiceSock, { type: "speak", text }));

  console.log("core: ready.");
  for await (const message of readLines(earsSock)) {
    if (message["type"] !== "utterance") continue;
    const text = String(message["text"] ?? "").trim();
    if (!text) continue;

    // An answer to a skill's ctx.ask(), not a new top-level utterance.
    if (conversation.offerUtterance(text)) continue;

    console.log(`core: heard ${JSON.stringify(text)}`);
    try {
      const utteranceEvent = memory.appendEvent({ kind: "utterance", actor: "owner", content: text, sessionId: SESSION_ID });

      // Fire-and-forget: never adds latency to the spoken response
      // (CLAUDE.md § 7). A failed extraction just means nothing learned
      // this turn -- factExtraction.ts already degrades internally, this
      // catch is only for a truly unexpected throw.
      extractAndRememberFacts(routerRegistry, memory, text, utteranceEvent.id).catch((err) => {
        console.error("core: fact extraction failed, continuing", err);
      });

      const { outcome } = await skillRegistry.dispatch(
        embedder,
        routerRegistry,
        text,
        SESSION_ID,
        (skillId) => buildSkillContext({ db, memory, routerRegistry, conversation }, skillId, SESSION_ID),
      );

      let speech: string;
      if (outcome.outcome === "dispatched") {
        // The skill already called ctx.say() itself -- don't speak again.
        speech = outcome.result.speech;
      } else {
        speech = await generalConversationReply(routerRegistry, memory, text, SESSION_ID);
        conversation.say(speech);
      }
      console.log(`core: said ${JSON.stringify(speech)}`);
      memory.appendEvent({ kind: "response", actor: "jarvis", content: speech, sessionId: SESSION_ID });
    } catch (err) {
      // One bad utterance (a skill bug, a model failure) must not take
      // the whole process down -- same "supervisor boundary" reasoning
      // as senses/ears/main.py's safe_run().
      console.error("core: failed to handle utterance, continuing", err);
    }
  }
}

main().catch((err) => {
  console.error("core: fatal error", err);
  process.exit(1);
});
