"""Fakes only — no `say` subprocess, no network. CLAUDE.md § 3."""

from __future__ import annotations

import socket

from senses import ipc
from senses.voice.fakes import FakeSayBackend
from senses.voice.main import run_forever, speak_text
from senses.voice.sentences import split_sentences


def test_split_sentences_basic() -> None:
    assert split_sentences("Hello there. How are you? Fine!") == [
        "Hello there.",
        "How are you?",
        "Fine!",
    ]


def test_split_sentences_empty() -> None:
    assert split_sentences("") == []
    assert split_sentences("   ") == []


def test_split_sentences_single_sentence_no_terminator() -> None:
    assert split_sentences("logged") == ["logged"]


def test_speak_text_calls_backend_once_per_sentence() -> None:
    backend = FakeSayBackend()

    speak_text("First sentence. Second sentence.", backend)

    assert backend.spoken == ["First sentence.", "Second sentence."]


def test_speak_text_empty_speaks_nothing() -> None:
    backend = FakeSayBackend()

    speak_text("", backend)

    assert backend.spoken == []


class _FlakySayBackend:
    """Fails on one specific sentence, to prove run_forever survives it."""

    def __init__(self) -> None:
        self.spoken: list[str] = []

    def speak(self, sentence: str) -> None:
        if sentence == "boom":
            raise RuntimeError("say exploded")
        self.spoken.append(sentence)


def test_run_forever_continues_after_one_bad_message() -> None:
    """`voice` is expected to keep running per SPEC.md § 2 — one bad `say`
    call must not end the process."""
    a, b = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
    backend = _FlakySayBackend()
    try:
        ipc.send_line(a, {"type": "speak", "text": "Good sentence."})
        ipc.send_line(a, {"type": "speak", "text": "boom"})
        ipc.send_line(a, {"type": "speak", "text": "Still works."})
        a.close()

        run_forever(backend, b)  # must not raise
    finally:
        b.close()

    assert backend.spoken == ["Good sentence.", "Still works."]
