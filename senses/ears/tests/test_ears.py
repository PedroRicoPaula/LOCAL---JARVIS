"""Fakes only — no mic, no whisper-cli, no network. CLAUDE.md § 3."""

from __future__ import annotations

from pathlib import Path

from senses.ears.fakes import FakeAudioSource, FakeHotkey, FakeTranscriber
from senses.ears.main import handle_one_utterance


def test_happy_path_emits_one_utterance() -> None:
    hotkey = FakeHotkey()
    audio_source = FakeAudioSource(wav_path=Path("/fake/utterance.wav"))
    transcriber = FakeTranscriber(text="turn on the lights")
    emitted: list[dict] = []

    result = handle_one_utterance(hotkey, audio_source, transcriber, emitted.append)

    assert result == "turn on the lights"
    assert hotkey.press_waited
    assert hotkey.release_waited
    assert audio_source.started
    assert audio_source.stopped
    assert transcriber.received_paths == [Path("/fake/utterance.wav")]
    assert len(emitted) == 1
    assert emitted[0]["type"] == "utterance"
    assert emitted[0]["text"] == "turn on the lights"
    assert "ts" in emitted[0]


def test_empty_transcription_emits_nothing() -> None:
    """Hotkey pressed but nothing was heard — never guessed at, nothing
    sent. Silence isn't a message."""
    hotkey = FakeHotkey()
    audio_source = FakeAudioSource()
    transcriber = FakeTranscriber(text="")
    emitted: list[dict] = []

    result = handle_one_utterance(hotkey, audio_source, transcriber, emitted.append)

    assert result == ""
    assert emitted == []
