"""senses/voice/sentences.py — split text so TTS can start on the first
complete sentence instead of waiting for everything (CLAUDE.md § 7). Boring
regex on sentence-ending punctuation; no NLP dependency for this."""

from __future__ import annotations

import re

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")


def split_sentences(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    return [s for s in _SENTENCE_BOUNDARY.split(text) if s]
