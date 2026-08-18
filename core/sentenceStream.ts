/**
 * core/sentenceStream.ts — turns a stream of model deltas into complete
 * sentences, so TTS can start on the first one instead of waiting for the
 * whole reply (CLAUDE.md § 7).
 *
 * The TypeScript counterpart to `senses/voice/sentences.py`, which does
 * the same split one stage later (on a reply `core` has already finished
 * assembling). Splitting *here* as well is the half § 7 actually cares
 * about -- `voice` splitting a reply it only receives after `core` has
 * awaited every token doesn't save the owner any waiting at all.
 *
 * Same boring regex approach as the Python original, deliberately: no NLP
 * dependency for this (CLAUDE.md § 3, "prefer boring"). It is allowed to
 * be slightly wrong on an abbreviation ("Dr. Silva" splitting early) --
 * the cost is one extra pause in speech, not a wrong answer, and the
 * Python side has run the same trade-off since Phase 1 without a real
 * complaint.
 */

/** A sentence ends at .!? followed by whitespace. Kept identical in
 * spirit to `senses/voice/sentences.py`'s `(?<=[.!?])\s+`. */
const BOUNDARY = /([.!?])(\s+)/;

export class SentenceAccumulator {
  private buffer = "";

  /**
   * Feed one delta. Returns every *complete* sentence that became
   * available because of it -- usually none, occasionally one, rarely
   * more than one if a chunk carried several.
   */
  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    for (;;) {
      const m = BOUNDARY.exec(this.buffer);
      if (!m) break;
      const end = m.index + m[1]!.length;
      const sentence = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end + m[2]!.length);
      if (sentence) out.push(sentence);
    }
    return out;
  }

  /** Whatever is left once the stream ends -- a final sentence with no
   * trailing whitespace after its punctuation, or an unterminated
   * fragment. Empty string when there is nothing left to say. */
  flush(): string {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest;
  }
}
