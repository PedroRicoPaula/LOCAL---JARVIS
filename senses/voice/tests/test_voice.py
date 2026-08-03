"""Fakes only — no `say` subprocess, no network. CLAUDE.md § 3."""

from __future__ import annotations

from senses.voice.fakes import FakeSayBackend
from senses.voice.main import speak_text
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
