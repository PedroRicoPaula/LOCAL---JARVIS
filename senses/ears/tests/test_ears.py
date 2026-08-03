"""Fakes only — no mic, no whisper-server, no real wake-word model, no
network. CLAUDE.md § 3."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from senses.ears.fakes import (
    FakeAck,
    FakeAudioSource,
    FakeHotkey,
    FakeTranscriber,
    FakeWakeWordDetector,
)
from senses.ears.main import (
    ConnectionHolder,
    handle_hotkey_utterance,
    handle_wakeword_utterance,
    safe_run,
)
from senses.ears.wake_word import watch


def test_handle_hotkey_utterance_happy_path() -> None:
    hotkey = FakeHotkey()
    audio_source = FakeAudioSource(wav_path=Path("/fake/utterance.wav"))
    transcriber = FakeTranscriber(text="turn on the lights")
    emitted: list[dict] = []

    result = handle_hotkey_utterance(hotkey, audio_source, transcriber, emitted.append)

    assert result == "turn on the lights"
    assert hotkey.release_waited  # caller's job to wait_for_press, not this function's
    assert audio_source.armed and not audio_source.last_auto_stop
    assert audio_source.disarmed
    assert transcriber.received_paths == [Path("/fake/utterance.wav")]
    assert emitted == [{"type": "utterance", "text": "turn on the lights", "ts": emitted[0]["ts"]}]


def test_handle_hotkey_utterance_empty_transcription_emits_nothing() -> None:
    """Hotkey pressed but nothing was heard — never guessed at, nothing
    sent. Silence isn't a message."""
    hotkey = FakeHotkey()
    audio_source = FakeAudioSource()
    transcriber = FakeTranscriber(text="")
    emitted: list[dict] = []

    result = handle_hotkey_utterance(hotkey, audio_source, transcriber, emitted.append)

    assert result == ""
    assert emitted == []


def test_handle_wakeword_utterance_fires_ack_and_uses_auto_stop() -> None:
    audio_source = FakeAudioSource(wav_path=Path("/fake/wake.wav"))
    transcriber = FakeTranscriber(text="what's the weather")
    ack = FakeAck()
    emitted: list[dict] = []

    result = handle_wakeword_utterance(audio_source, transcriber, emitted.append, ack)

    assert result == "what's the weather"
    assert ack.fired
    assert audio_source.armed and audio_source.last_auto_stop  # auto_stop=True, unlike hotkey path
    assert audio_source.auto_stop_waited
    assert audio_source.disarmed
    assert emitted[0]["text"] == "what's the weather"


class _Raising:
    def __init__(self, exc: Exception) -> None:
        self._exc = exc

    def __call__(self) -> None:
        raise self._exc


def test_safe_run_swallows_any_failure() -> None:
    """A capture cycle failing (whisper-server hiccup, corrupt WAV) must
    not kill the `ears` daemon — it's "always on" per SPEC.md § 2.
    Connection failures don't need special-casing here anymore:
    ConnectionHolder.emit already swallows those internally, so nothing
    connection-related can reach safe_run at all."""
    safe_run(_Raising(RuntimeError("whisper-server exploded")), "test")  # must not raise


class _FakeSocket:
    def __init__(self, fail: bool = False) -> None:
        self._fail = fail
        self.sent: list[bytes] = []

    def sendall(self, data: bytes) -> None:
        if self._fail:
            raise BrokenPipeError()
        self.sent.append(data)


def test_connection_holder_drops_when_nobody_connected() -> None:
    holder = ConnectionHolder()
    holder.emit({"type": "utterance", "text": "hello"})  # must not raise


def test_connection_holder_sends_when_connected() -> None:
    holder = ConnectionHolder()
    sock = _FakeSocket()
    holder.set(sock)  # type: ignore[arg-type]

    holder.emit({"type": "utterance", "text": "hello"})

    assert len(sock.sent) == 1
    assert b"hello" in sock.sent[0]


def test_connection_holder_clears_on_send_failure() -> None:
    holder = ConnectionHolder()
    sock = _FakeSocket(fail=True)
    holder.set(sock)  # type: ignore[arg-type]

    holder.emit({"type": "utterance", "text": "hello"})  # must not raise

    # A second emit with the connection cleared should just drop silently,
    # not fail again trying to use the dead socket.
    holder.emit({"type": "utterance", "text": "again"})


def test_wake_word_watch_fires_once_per_crossing_not_per_sustained_frame() -> None:
    """One utterance produces several consecutive high-score frames
    (confirmed empirically: 8 frames >= 0.9 for one "hey jarvis") — must
    fire once, not once per frame."""
    scores = [0.0, 0.0, 0.6, 0.9, 0.95, 0.9, 0.0, 0.0, 0.7, 0.0]
    detector = FakeWakeWordDetector(scores=scores)
    fired: list[float] = []
    on_frame = watch(detector, on_wake=fired.append, threshold=0.5)

    for _ in scores:
        on_frame(np.zeros(1280, dtype="int16"))

    assert fired == [0.6, 0.7]  # two separate crossings, not five high-score frames
