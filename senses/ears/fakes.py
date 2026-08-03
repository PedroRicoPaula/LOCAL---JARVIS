"""senses/ears/fakes.py — test doubles for everything that touches the
outside world. Per CLAUDE.md § 3: tests must pass with no mic, no models,
no network."""

from __future__ import annotations

from pathlib import Path


class FakeAudioSource:
    def __init__(self, wav_path: Path = Path("/dev/null")) -> None:
        self.wav_path = wav_path
        self.started = False
        self.stopped = False

    def start(self) -> None:
        self.started = True

    def stop(self) -> Path:
        self.stopped = True
        return self.wav_path


class FakeHotkey:
    """A single press/release pair per instance — enough to drive one
    handle_one_utterance() call in a test."""

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
