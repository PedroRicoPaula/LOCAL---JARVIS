/**
 * core/router/providers/sse.ts — OpenAI-style Server-Sent Events
 * parsing, shared by every streaming provider.
 *
 * This lived as **three byte-identical 33-line copies** (`nim.ts`,
 * `openaiCompatible.ts`, `google.ts`) until 2026-08-22, each carrying an
 * identical comment claiming it was "four lines of parsing, not worth an
 * import for." It was 33 lines, and the cost of the copies was real: the
 * trailing-flush fix (2026-08-17) and every future parser fix has to be
 * written three times or silently diverge. `google.ts` is not
 * OpenAI-compatible and cannot inherit from `openaiCompatible.ts`, which
 * is exactly why the parser belongs in its own module rather than on a
 * base class.
 */

export async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush a final event the server left without its trailing
        // blank line. Real SSE servers terminate with "\n\n" after
        // [DONE], so this is belt-and-braces -- but `ollama.ts`'s NDJSON
        // reader has always flushed its trailing partial line, and a
        // silent truncation of the last token is not a difference worth
        // having between two parsers in the same directory (2026-08-17).
        const rest = buffer.trim();
        if (rest) yield rest;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.startsWith("data:")) {
          const data = line.slice("data:".length).trim();
          if (data) yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
