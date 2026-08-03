"""senses/voice/say_backend.py — text in, spoken audio out. ADR-004: macOS
`say` for Phase 1, Piper from Phase 2."""

from __future__ import annotations

import subprocess
from typing import Protocol

from senses.voice.config import SAY_BIN, SAY_VOICE


class SayBackend(Protocol):
    def speak(self, sentence: str) -> None:
        """Blocks until the sentence has finished playing — that's what
        makes sentence-by-sentence streaming work: the caller moves on to
        the next sentence exactly when this one ends, no separate audio
        queue needed for Phase 1's scale."""
        ...


class MacSayBackend:
    def __init__(self, say_bin: str = SAY_BIN, voice: str | None = SAY_VOICE) -> None:
        self._say_bin = say_bin
        self._voice = voice

    def speak(self, sentence: str) -> None:
        cmd = [self._say_bin]
        if self._voice:
            cmd += ["-v", self._voice]
        cmd.append(sentence)
        subprocess.run(cmd, check=True)
