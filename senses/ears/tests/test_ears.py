"""Fakes only — no mic, no whisper-server, no real wake-word model, no
network. CLAUDE.md § 3."""

from __future__ import annotations

import threading
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
    make_wake_handler,
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
    assert emitted == [
        {"type": "listening", "ts": emitted[0]["ts"]},
        {"type": "utterance", "text": "turn on the lights", "ts": emitted[1]["ts"]},
    ]


def test_handle_hotkey_utterance_empty_transcription_emits_nothing() -> None:
    """Hotkey pressed but nothing was heard — never guessed at, no
    utterance sent. Silence isn't a message, but "the mic was armed" is a
    real, separate fact and is still emitted."""
    hotkey = FakeHotkey()
    audio_source = FakeAudioSource()
    transcriber = FakeTranscriber(text="")
    emitted: list[dict] = []

    result = handle_hotkey_utterance(hotkey, audio_source, transcriber, emitted.append)

    assert result == ""
    assert emitted == [{"type": "listening", "ts": emitted[0]["ts"]}]


def test_handle_wakeword_utterance_fires_ack_and_uses_auto_stop() -> None:
    audio_source = FakeAudioSource(wav_path=Path("/fake/wake.wav"))
    transcriber = FakeTranscriber(text="what's the weather")
    ack = FakeAck()
    emitted: list[dict] = []

    result = handle_wakeword_utterance(audio_source, transcriber, emitted.append, ack)

    assert result == "what's the weather"
    assert ack.fired
    assert not ack.fired_no_speech  # real speech was heard -- no "didn't catch that" cue
    assert audio_source.armed and audio_source.last_auto_stop  # auto_stop=True, unlike hotkey path
    assert audio_source.auto_stop_waited
    assert audio_source.disarmed
    assert emitted[0] == {"type": "listening", "ts": emitted[0]["ts"]}
    assert emitted[1]["text"] == "what's the weather"


def test_handle_wakeword_utterance_empty_transcription_fires_no_speech_ack() -> None:
    """The real incident this fixes (2026-08-11/12): a wake-word capture
    that transcribes to nothing previously gave zero feedback -- the wake
    ack fires, then silence, indistinguishable from the whole pipeline
    having hung. Confirmed live it hadn't (busy_lock was already free);
    this is the fix -- a distinct, honest "didn't catch that" cue instead
    of silence."""
    audio_source = FakeAudioSource(wav_path=Path("/fake/wake.wav"))
    transcriber = FakeTranscriber(text="")
    ack = FakeAck()
    emitted: list[dict] = []

    result = handle_wakeword_utterance(audio_source, transcriber, emitted.append, ack)

    assert result == ""
    assert ack.fired  # the wake word itself was still heard
    assert ack.fired_no_speech  # but nothing usable followed it -- said so
    assert emitted == [{"type": "listening", "ts": emitted[0]["ts"]}]  # no utterance emitted


def test_handle_hotkey_utterance_empty_transcription_does_not_need_a_no_speech_cue() -> None:
    """The hotkey path already has physical key-release feedback -- no
    real ambiguity the way the wake-word path has, so capture_and_transcribe's
    on_empty default (a no-op) is left as-is here rather than wiring an
    Ack through a path that doesn't need one."""
    hotkey = FakeHotkey()
    audio_source = FakeAudioSource()
    transcriber = FakeTranscriber(text="")
    emitted: list[dict] = []

    result = handle_hotkey_utterance(hotkey, audio_source, transcriber, emitted.append)

    assert result == ""  # on_empty's default no-op must not raise or alter the result


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


def test_wake_handler_ignores_detection_while_busy() -> None:
    """Confirmed live (Pedro): saying "hey jarvis" mid-utterance used to
    survive the finally-block cleanup and fire a spurious second capture
    the instant the first one ended. Gating on `busy_lock.locked()` before
    ever setting the event closes that race."""
    busy_lock = threading.Lock()
    wake_event = threading.Event()
    logged: list[str] = []
    on_wake = make_wake_handler(busy_lock, wake_event, log=logged.append)

    with busy_lock:
        on_wake(0.9)

    assert not wake_event.is_set()
    assert logged == []


def test_wake_handler_fires_when_not_busy() -> None:
    busy_lock = threading.Lock()
    wake_event = threading.Event()
    logged: list[str] = []
    on_wake = make_wake_handler(busy_lock, wake_event, log=logged.append)

    on_wake(0.9)

    assert wake_event.is_set()
    assert logged == ["ears: wake word detected (score=0.900)"]


def test_wake_word_watch_fires_on_falling_edge_with_peak_score() -> None:
    """Fires once the wake phrase has *finished* (score drops back below
    threshold), not the instant it starts — arming the recorder on the
    rising edge was capturing the tail of "jarvis" itself as the start of
    the recorded command (confirmed via Pedro's live testing: "Hey Jarvis,
    what's the weather" came back as "HRVs are you listening to me?").
    Reports the peak score seen during the crossing, not the trailing
    below-threshold score that triggered the fire."""
    scores = [0.0, 0.0, 0.6, 0.9, 0.95, 0.9, 0.0, 0.0, 0.7, 0.0]
    detector = FakeWakeWordDetector(scores=scores)
    fired: list[float] = []
    on_frame = watch(detector, on_wake=fired.append, threshold=0.5)

    for _ in scores:
        on_frame(np.zeros(1280, dtype="int16"))

    assert fired == [0.95, 0.7]  # peak of each crossing, reported once it ends


def test_wake_word_watch_fires_via_safety_cap_if_score_never_falls() -> None:
    """Shouldn't happen in practice (one utterance sustains ~8 frames) but
    a detector that can permanently stop triggering is worse than one that
    fires a little late."""
    scores = [0.9] * 25  # never drops below threshold on its own
    detector = FakeWakeWordDetector(scores=scores)
    fired: list[float] = []
    on_frame = watch(detector, on_wake=fired.append, threshold=0.5, max_frames_above=20)

    for _ in scores:
        on_frame(np.zeros(1280, dtype="int16"))

    assert fired == [0.9]  # fired once, at frame 20, not zero times
