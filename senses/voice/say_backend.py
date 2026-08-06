"""senses/voice/say_backend.py — text in, spoken audio out. ADR-004: macOS
`say` for Phase 1, Piper from Phase 2."""

from __future__ import annotations

import subprocess
from typing import Protocol

from senses.voice.config import SAY_BIN, SAY_VOICE


class SayBackend(Protocol):
    def speak(self, sentence: str, voice: str | None = None) -> None:
        """Blocks until the sentence has finished playing — that's what
        makes sentence-by-sentence streaming work: the caller moves on to
        the next sentence exactly when this one ends, no separate audio
        queue needed for Phase 1's scale.

        `voice`, if given, overrides the backend's default for this one
        call — ADR-033's bilingual TTS: `main.py`'s `speak_text` picks one
        voice for the whole response (`language.detect_language`) and
        passes it into every sentence of that response, never the
        constructor default. Omitted (tests, Phase 1's original callers)
        falls back to the backend's own configured voice, unchanged."""
        ...


class MacSayBackend:
    def __init__(self, say_bin: str = SAY_BIN, voice: str | None = SAY_VOICE) -> None:
        self._say_bin = say_bin
        self._voice = voice

    def speak(self, sentence: str, voice: str | None = None) -> None:
        cmd = [self._say_bin]
        chosen = voice if voice is not None else self._voice
        if chosen:
            cmd += ["-v", chosen]
        cmd.append(sentence)
        subprocess.run(cmd, check=True)
