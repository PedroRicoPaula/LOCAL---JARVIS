"""senses/ears/fakes.py — test doubles for everything that touches the
outside world. Per CLAUDE.md § 3: tests must pass with no mic, no models,
no network."""

from __future__ import annotations

from pathlib import Path

import numpy as np


class FakeAudioSource:
    def __init__(self, wav_path: Path = Path("/dev/null")) -> None:
        self.wav_path = wav_path
        self.armed = False
        self.disarmed = False
        self.last_auto_stop: bool | None = None
        self.auto_stop_waited = False

    def arm(self, auto_stop: bool = False) -> None:
        self.armed = True
        self.last_auto_stop = auto_stop

    def disarm(self) -> Path:
        self.disarmed = True
        return self.wav_path

    def wait_for_auto_stop(self, timeout: float | None = None) -> None:
        self.auto_stop_waited = True


class FakeHotkey:
    """A single press/release pair per instance — enough to drive one
    handle_hotkey_utterance() call in a test."""

    def __init__(self) -> None:
        self.press_waited = False
        self.release_waited = False

    def wait_for_press(self) -> None:
        self.press_waited = True

    def wait_for_release(self) -> None:
        self.release_waited = True


class FakeTranscriber:
    def __init__(self, text: str = "hello jarvis") -> None:
        self.text = text
        self.received_paths: list[Path] = []

    def transcribe(self, wav_path: Path) -> str:
        self.received_paths.append(wav_path)
        return self.text


class FakeWakeWordDetector:
    """Scripted scores, one per call — enough to drive a detection (or
    not) in a test without loading the real ONNX model."""

    def __init__(self, scores: list[float] | None = None) -> None:
        self._scores = scores or [0.0]
        self._i = 0

    def score(self, frame: np.ndarray) -> float:
        score = self._scores[min(self._i, len(self._scores) - 1)]
        self._i += 1
        return score


class FakeAck:
    def __init__(self) -> None:
        self.fired = False

    def fire(self) -> None:
        self.fired = True
