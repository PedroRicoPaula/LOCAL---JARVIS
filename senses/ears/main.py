"""senses/ears/main.py — wake word -> VAD -> STT -> text.

Two independent trigger sources feed the same capture pipeline: the Tab
hotkey (Phase 1) and "hey jarvis" (Phase 2), serialized by one lock so
they can't both record at once. Runs as a long-lived server: listens on a
Unix socket for whoever connects (the Phase 1 echo bridge today, core/
from Phase 3 on) and emits one {"type": "utterance", ...} line per
captured command. No executor imports here, by construction — see
docs/ARCHITECTURE.md § 7.
"""

from __future__ import annotations

import socket
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from senses import ipc
from senses.ears import config, wake_word, whisper_server
from senses.ears.ack import Ack, SystemAck
from senses.ears.audio_capture import AudioSource, ContinuousAudioSource
from senses.ears.hotkey import Hotkey, PynputHotkey
from senses.ears.transcribe import Transcriber, WhisperServerTranscriber
from senses.ears.wake_word import OpenWakeWordDetector

Emit = Callable[[dict[str, Any]], None]


def capture_and_transcribe(
    arm: Callable[[], None],
    wait_for_end: Callable[[], None],
    disarm: Callable[[], Path],
    transcriber: Transcriber,
    emit: Emit,
) -> str:
    """The shared core of both trigger paths: arm, block until whatever
    signals the command is over (key release, or auto-stop silence),
    disarm, transcribe, emit if non-empty. Returns the transcribed text
    ("" if nothing was heard — never guessed at, per CLAUDE.md § 0.5's
    spirit applied to speech, not just numbers)."""
    arm()
    wait_for_end()
    end_of_speech_ts = time.time()  # DoD's "time to first audible syllable"
    wav_path = disarm()

    text = transcriber.transcribe(wav_path)
    if text:
        emit({"type": "utterance", "text": text, "ts": end_of_speech_ts})
    return text


def handle_hotkey_utterance(
    hotkey: Hotkey, audio_source: AudioSource, transcriber: Transcriber, emit: Emit
) -> str:
    """Caller's job to have already waited for the press — this arms,
    waits for release, and finishes the cycle."""
    return capture_and_transcribe(
        arm=lambda: audio_source.arm(auto_stop=False),
        wait_for_end=hotkey.wait_for_release,
        disarm=audio_source.disarm,
        transcriber=transcriber,
        emit=emit,
    )


def handle_wakeword_utterance(
    audio_source: AudioSource, transcriber: Transcriber, emit: Emit, ack: Ack
) -> str:
    """Caller's job to have already detected the wake word — this acks,
    arms with silence-based auto-stop, and finishes the cycle."""
    ack.fire()
    return capture_and_transcribe(
        arm=lambda: audio_source.arm(auto_stop=True),
        wait_for_end=audio_source.wait_for_auto_stop,
        disarm=audio_source.disarm,
        transcriber=transcriber,
        emit=emit,
    )


def safe_run(fn: Callable[[], None], label: str) -> None:
    """Any single capture cycle failing (whisper-server hiccup, a corrupt
    WAV) is logged and swallowed rather than killing the daemon — `ears`
    is "launchd, always on" per SPEC.md § 2."""
    try:
        fn()
    except Exception as exc:  # broad on purpose — supervisor boundary
        print(f"ears: {label} failed, continuing ({exc!r})")


def run_hotkey_forever(
    hotkey: Hotkey,
    audio_source: AudioSource,
    transcriber: Transcriber,
    emit: Emit,
    busy_lock: threading.Lock,
) -> None:
    while True:
        hotkey.wait_for_press()
        if not busy_lock.acquire(blocking=False):
            print("ears: hotkey pressed while already capturing, ignoring")
            hotkey.wait_for_release()
            continue
        try:
            safe_run(
                lambda: handle_hotkey_utterance(hotkey, audio_source, transcriber, emit),
                "hotkey utterance",
            )
        finally:
            busy_lock.release()


def run_wakeword_forever(
    wake_event: threading.Event,
    audio_source: AudioSource,
    transcriber: Transcriber,
    emit: Emit,
    ack: Ack,
    busy_lock: threading.Lock,
) -> None:
    while True:
        wake_event.wait()
        wake_event.clear()
        if not busy_lock.acquire(blocking=False):
            print("ears: wake word heard while already capturing, ignoring")
            continue
        try:
            safe_run(
                lambda: handle_wakeword_utterance(audio_source, transcriber, emit, ack),
                "wake-word utterance",
            )
        finally:
            # The wake-word scorer keeps running during our own recording
            # (frame listeners always fire — see audio_capture.py) and can
            # re-cross threshold on the same utterance's trailing audio.
            # Discard that here rather than chaining straight into a second,
            # spurious capture cycle the moment this one finishes.
            wake_event.clear()
            busy_lock.release()


class ConnectionHolder:
    """The bridge/core connection, swappable across reconnects, shared by
    both trigger threads. Decouples "is anyone listening" from "are we
    capturing" — `ears` keeps working either way; an utterance with nobody
    connected is logged and dropped, not an error."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._conn: socket.socket | None = None

    def set(self, conn: socket.socket) -> None:
        with self._lock:
            self._conn = conn

    def emit(self, message: dict[str, Any]) -> None:
        with self._lock:
            conn = self._conn
        if conn is None:
            print(f"ears: no bridge/core connected, dropping {message.get('text', '')!r}")
            return
        try:
            ipc.send_line(conn, message)
        except (BrokenPipeError, ConnectionResetError):
            print("ears: bridge/core disconnected")
            with self._lock:
                if self._conn is conn:
                    self._conn = None


def accept_loop(socket_server: socket.socket, holder: ConnectionHolder) -> None:
    while True:
        conn = ipc.accept_one(socket_server)
        print("ears: bridge/core connected")
        holder.set(conn)


def main() -> None:
    print("ears: starting whisper-server (model load takes a few seconds)...")
    server_process = whisper_server.start()
    try:
        whisper_server.wait_until_ready()
        print(f"ears: whisper-server ready at {whisper_server.BASE_URL}")

        audio_source = ContinuousAudioSource()
        hotkey = PynputHotkey()
        transcriber = WhisperServerTranscriber()
        detector = OpenWakeWordDetector()
        ack = SystemAck()
        holder = ConnectionHolder()
        busy_lock = threading.Lock()
        wake_event = threading.Event()

        def on_wake(score: float) -> None:
            print(f"ears: wake word detected (score={score:.3f})")
            wake_event.set()

        audio_source.add_frame_listener(wake_word.watch(detector, on_wake))
        audio_source.start()
        print('ears: listening continuously — say "hey jarvis" or hold Tab')

        threading.Thread(
            target=run_hotkey_forever,
            args=(hotkey, audio_source, transcriber, holder.emit, busy_lock),
            daemon=True,
        ).start()
        threading.Thread(
            target=run_wakeword_forever,
            args=(wake_event, audio_source, transcriber, holder.emit, ack, busy_lock),
            daemon=True,
        ).start()

        socket_server = ipc.listen(config.SOCKET_PATH)
        print(f"ears: socket ready at {config.SOCKET_PATH}")
        accept_loop(socket_server, holder)
    finally:
        whisper_server.stop(server_process)


if __name__ == "__main__":
    main()
