"""senses/voice/fakes.py — test doubles. Per CLAUDE.md § 3: tests must pass
with no mic, no models, no network — `say` counts as "the outside world"
here since it's a real subprocess call."""

from __future__ import annotations


class FakeSayBackend:
    def __init__(self) -> None:
        self.spoken: list[str] = []
        self.voices: list[str | None] = []

    def speak(self, sentence: str, voice: str | None = None) -> None:
        self.spoken.append(sentence)
        self.voices.append(voice)
