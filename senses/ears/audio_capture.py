"""senses/ears/audio_capture.py — microphone in, WAV file out."""

from __future__ import annotations

import tempfile
import wave
from pathlib import Path
from typing import Protocol

import numpy as np
import sounddevice as sd

from senses.ears.config import CHANNELS, SAMPLE_RATE


class AudioSource(Protocol):
    def start(self) -> None:
        """Begin recording. Called on hotkey press."""
        ...

    def stop(self) -> Path:
        """Stop recording, return the path to a WAV file of what was heard.
        Called on hotkey release."""
        ...


class MicAudioSource:
    """Records from the default input device while armed."""

    def __init__(self, sample_rate: int = SAMPLE_RATE, channels: int = CHANNELS) -> None:
        self._sample_rate = sample_rate
        self._channels = channels
        self._frames: list[np.ndarray] = []
        self._stream: sd.InputStream | None = None

    def start(self) -> None:
        self._frames = []
        self._stream = sd.InputStream(
            samplerate=self._sample_rate,
            channels=self._channels,
            dtype="int16",
            callback=self._on_audio,
        )
        self._stream.start()

    def _on_audio(self, indata: np.ndarray, frames: int, time_info: object, status: object) -> None:
        self._frames.append(indata.copy())

    def stop(self) -> Path:
        assert self._stream is not None, "stop() called before start()"
        self._stream.stop()
        self._stream.close()
        self._stream = None

        audio = (
            np.concatenate(self._frames, axis=0)
            if self._frames
            else np.zeros((0, self._channels), dtype="int16")
        )
        path = Path(tempfile.mkstemp(suffix=".wav", prefix="jarvis-utterance-")[1])
        with wave.open(str(path), "wb") as wav:
            wav.setnchannels(self._channels)
            wav.setsampwidth(2)  # int16
            wav.setframerate(self._sample_rate)
            wav.writeframes(audio.tobytes())
        return path
