"""senses/ears/main.py — wake word -> VAD -> STT -> text. (Phase 1: hotkey
instead of wake word; VAD lives inside whisper-cli, see transcribe.py.)

Runs as a long-lived server: listens on a Unix socket, accepts whoever
connects (the Phase 1 echo bridge today, core/ from Phase 3 on), and emits
one {"type": "utterance", ...} line per push-to-talk press. No executor
imports here, by construction — see docs/ARCHITECTURE.md § 7.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from senses import ipc
from senses.ears import config
from senses.ears.audio_capture import AudioSource, MicAudioSource
from senses.ears.hotkey import Hotkey, PynputHotkey
from senses.ears.transcribe import Transcriber, WhisperCliTranscriber

Emit = Callable[[dict[str, Any]], None]


def handle_one_utterance(
    hotkey: Hotkey,
    audio_source: AudioSource,
    transcriber: Transcriber,
    emit: Emit,
) -> str:
    """One press-record-release-transcribe-emit cycle. Returns the
    transcribed text ("" if the owner pressed the key but nothing was
    heard — never guessed at, per CLAUDE.md § 0.5's spirit applied to
    speech, not just numbers)."""
    hotkey.wait_for_press()
    audio_source.start()
    hotkey.wait_for_release()
    end_of_speech_ts = time.time()  # DoD's "time to first audible syllable"
    wav_path: Path = audio_source.stop()  # starts counting from here, not from emit()

    text = transcriber.transcribe(wav_path)
    if text:
        emit({"type": "utterance", "text": text, "ts": end_of_speech_ts})
    return text


def run_forever(
    hotkey: Hotkey,
    audio_source: AudioSource,
    transcriber: Transcriber,
    emit: Emit,
) -> None:
    while True:
        handle_one_utterance(hotkey, audio_source, transcriber, emit)


def main() -> None:
    hotkey = PynputHotkey()
    audio_source = MicAudioSource()
    transcriber = WhisperCliTranscriber()

    server = ipc.listen(config.SOCKET_PATH)
    print(f"ears: listening on {config.SOCKET_PATH}, hold the right Option key to talk")

    while True:
        conn = ipc.accept_one(server)
        print("ears: bridge/core connected")
        try:
            run_forever(
                hotkey, audio_source, transcriber,
                lambda msg, conn=conn: ipc.send_line(conn, msg),
            )
        except (BrokenPipeError, ConnectionResetError):
            print("ears: bridge/core disconnected, waiting for reconnect")
            continue


if __name__ == "__main__":
    main()
