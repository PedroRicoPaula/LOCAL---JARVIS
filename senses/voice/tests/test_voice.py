"""Fakes only — no `say` subprocess, no network. CLAUDE.md § 3."""

from __future__ import annotations

import json
import socket

from senses import ipc
from senses.voice import config
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


def test_speak_text_uses_the_english_voice_for_an_english_reply() -> None:
    backend = FakeSayBackend()

    speak_text("Good morning. The weather looks fine today.", backend)

    assert backend.voices == [config.SAY_VOICE, config.SAY_VOICE]


def test_speak_text_uses_the_portuguese_voice_for_a_portuguese_reply() -> None:
    backend = FakeSayBackend()

    speak_text("Bom dia! Está tudo pronto.", backend)

    assert backend.voices == [config.SAY_VOICE_PT, config.SAY_VOICE_PT]


def test_speak_text_picks_one_voice_for_the_whole_reply_not_per_sentence() -> None:
    """Owner's own choice (2026-08-06): a mixed-language reply gets ONE
    voice for every sentence, not a switch mid-response -- even though the
    second sentence alone would score as English."""
    backend = FakeSayBackend()

    speak_text(
        "Já verifiquei a tua lista de compras, está tudo pronto. All items are in stock.",
        backend,
    )

    assert backend.voices == [config.SAY_VOICE_PT, config.SAY_VOICE_PT]


class _FlakySayBackend:
    """Fails on one specific sentence, to prove run_forever survives it."""

    def __init__(self) -> None:
        self.spoken: list[str] = []

    def speak(self, sentence: str, voice: str | None = None) -> None:
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
        # Half-close: signals EOF to b's reads (ending run_forever's loop
        # after the 3rd message) without fully closing a, so b's own
        # "speaking" status sends back to a -- real behavior now that
        # run_forever reports speaking start/stop -- don't hit a broken
        # pipe. A full a.close() would close both directions and make
        # those sends fail immediately, which isn't what a live core
        # disconnect looks like mid-message.
        a.shutdown(socket.SHUT_WR)

        run_forever(backend, b)  # must not raise
    finally:
        a.close()
        b.close()

    assert backend.spoken == ["Good sentence.", "Still works."]


def test_run_forever_reports_speaking_active_around_each_message() -> None:
    """SPEC.md's dashboard needs to show real progress, not take "it's
    working on it" on faith -- `speaking: {active}` must bracket every
    message actually spoken, true start to true end (SayBackend.speak
    blocks for the real audio duration)."""
    a, b = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
    backend = FakeSayBackend()
    try:
        ipc.send_line(a, {"type": "speak", "text": "Hello."})
        a.shutdown(socket.SHUT_WR)

        run_forever(backend, b)

        a.settimeout(1)
        raw = a.recv(65536).decode("utf-8")
    finally:
        a.close()
        b.close()

    received = [json.loads(line) for line in raw.splitlines() if line.strip()]
    assert received == [
        {"type": "speaking", "active": True},
        {"type": "speaking", "active": False},
    ]
