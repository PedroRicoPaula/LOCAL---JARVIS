"""senses/ears/audio_capture.py — microphone in, WAV file out.

Phase 2 changed this from "open a stream per utterance" to one persistent
stream, opened once at `ears` startup: a wake-word daemon has to score
every ~80ms frame continuously, and opening a second competing
InputStream just for on-demand recording risks real device-contention
flakiness. Both the wake-word scorer and the on-demand recorder now read
from the same stream — the scorer via `add_frame_listener`, the recorder
via `arm()`/`disarm()`.

The real-time audio callback (`_on_block`) does the absolute minimum:
copy the buffer into a queue and return. Everything else — wake-word
ONNX inference, RMS/silence bookkeeping — happens on a separate worker
thread that drains the queue. Running that work directly inside the
PortAudio callback caused real, reproducible hangs during Phase 2
development: the callback missed its ~80ms deadline, frames stopped
arriving at the expected rate, and auto-stop's frame-count-based timeout
never reached its target. See PROGRESS.md's Phase 2 log.
"""

from __future__ import annotations

import os
import queue
import tempfile
import threading
import wave
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

import numpy as np
import sounddevice as sd

from senses.ears.config import (
    CHANNELS,
    MAX_RECORDING_FRAMES,
    MIN_SPEECH_FRAMES,
    SAMPLE_RATE,
    SILENCE_FRAMES_TO_STOP,
    SILENCE_RMS_THRESHOLD,
    WAKE_WORD_FRAME_SAMPLES,
)

FrameListener = Callable[[np.ndarray], None]


class AudioSource(Protocol):
    def arm(self, auto_stop: bool = False) -> None:
        """Start accumulating audio. `auto_stop=True` also watches for
        trailing silence — see `wait_for_auto_stop`."""
        ...

    def disarm(self) -> Path:
        """Stop accumulating, return the path to a WAV file of what was
        captured while armed."""
        ...


def _write_wav(audio: np.ndarray, sample_rate: int, channels: int) -> Path:
    # `mkstemp` returns (fd, path) and opens the fd -- it must be closed,
    # or every captured utterance leaks one for the life of the daemon.
    # Measured 2026-08-17: 30 captures leaked 30 file descriptors, on a
    # process SPEC.md § 2 keeps running permanently. Left alone, `ears`
    # eventually hits the process fd limit and simply stops hearing.
    # `wave.open` below opens the path separately, so nothing needs this
    # descriptor.
    fd, name = tempfile.mkstemp(suffix=".wav", prefix="jarvis-utterance-")
    os.close(fd)
    path = Path(name)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)  # int16
        wav.setframerate(sample_rate)
        wav.writeframes(audio.tobytes())
    return path


class ContinuousAudioSource:
    """One persistent InputStream for the whole `ears` process lifetime.
    `start()`/`stop()` open/close the device and the processing thread
    once; `arm()`/`disarm()` control recording within that.
    """

    def __init__(
        self,
        sample_rate: int = SAMPLE_RATE,
        channels: int = CHANNELS,
        frame_size: int = WAKE_WORD_FRAME_SAMPLES,
    ) -> None:
        self._sample_rate = sample_rate
        self._channels = channels
        self._frame_size = frame_size

        self._frame_listeners: list[FrameListener] = []
        self._frame_queue: queue.Queue[np.ndarray] = queue.Queue()
        self._worker: threading.Thread | None = None
        self._running = False

        self._armed = False
        self._auto_stop_enabled = False
        self._recording_frames: list[np.ndarray] = []
        self._recording_frame_count = 0
        self._consecutive_silence = 0
        self._auto_stop_event = threading.Event()

        self._stream = sd.InputStream(
            samplerate=sample_rate,
            channels=channels,
            dtype="int16",
            blocksize=frame_size,
            callback=self._on_block,
        )

    def start(self) -> None:
        self._running = True
        self._worker = threading.Thread(target=self._process_loop, daemon=True)
        self._worker.start()
        self._stream.start()

    def stop(self) -> None:
        self._stream.stop()
        self._stream.close()
        self._running = False
        self._frame_queue.put(np.zeros(0, dtype="int16"))  # unstick the worker's get()
        if self._worker is not None:
            self._worker.join(timeout=2.0)

    def add_frame_listener(self, listener: FrameListener) -> None:
        """`listener` is called with every raw ~80ms frame, armed or not —
        for the wake-word scorer, which must always be listening."""
        self._frame_listeners.append(listener)

    def _on_block(self, indata: np.ndarray, frames: int, time_info: object, status: object) -> None:
        # Real-time audio thread: must stay fast. Copy and hand off, no
        # inference, no I/O — see module docstring for why this matters.
        self._frame_queue.put(indata.copy().reshape(-1))

    def _process_loop(self) -> None:
        while self._running:
            frame = self._frame_queue.get()
            if not self._running:
                return
            self._process_frame(frame)

    def _process_frame(self, frame: np.ndarray) -> None:
        for listener in self._frame_listeners:
            listener(frame)

        if not self._armed:
            return
        self._recording_frames.append(frame)
        self._recording_frame_count += 1

        if not self._auto_stop_enabled:
            return
        if self._recording_frame_count < MIN_SPEECH_FRAMES:
            return  # grace period: don't count silence before speech starts

        rms = float(np.sqrt(np.mean(frame.astype(np.float64) ** 2)))
        if rms < SILENCE_RMS_THRESHOLD:
            self._consecutive_silence += 1
        else:
            self._consecutive_silence = 0

        if (
            self._consecutive_silence >= SILENCE_FRAMES_TO_STOP
            or self._recording_frame_count >= MAX_RECORDING_FRAMES
        ):
            self._auto_stop_event.set()

    def arm(self, auto_stop: bool = False) -> None:
        self._recording_frames = []
        self._recording_frame_count = 0
        self._consecutive_silence = 0
        self._auto_stop_enabled = auto_stop
        self._auto_stop_event.clear()
        self._armed = True

    def disarm(self) -> Path:
        self._armed = False
        audio = (
            np.concatenate(self._recording_frames)
            if self._recording_frames
            else np.zeros(0, dtype="int16")
        )
        return _write_wav(audio, self._sample_rate, self._channels)

    def wait_for_auto_stop(self, timeout: float | None = None) -> None:
        """Blocks until `arm(auto_stop=True)`'s silence/max-duration
        condition fires. Only meaningful after an auto_stop arm() call."""
        self._auto_stop_event.wait(timeout=timeout)
