"""senses/ears/transcribe.py — WAV file in, text out. Shells out to
whisper-cli rather than a Python binding: it's already installed (brew),
already Metal-accelerated on Apple Silicon, and its own --vad flag runs the
same Silero VAD model ADR-003 calls for without a second ML runtime in
Python. See DECISIONS.md ADR-001 for why keeping this machine's dependency
footprint small is not optional politeness."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Protocol

from senses.ears.config import LANGUAGE, VAD_MODEL, WHISPER_CLI, WHISPER_MODEL


class Transcriber(Protocol):
    def transcribe(self, wav_path: Path) -> str:
        """Empty string means no speech was detected — never guessed at."""
        ...


class WhisperCliTranscriber:
    def __init__(
        self,
        whisper_cli: str = WHISPER_CLI,
        model: Path = WHISPER_MODEL,
        vad_model: Path = VAD_MODEL,
        language: str = LANGUAGE,
        timeout_s: float = 30.0,
    ) -> None:
        self._whisper_cli = whisper_cli
        self._model = model
        self._vad_model = vad_model
        self._language = language
        self._timeout_s = timeout_s

    def transcribe(self, wav_path: Path) -> str:
        result = subprocess.run(
            [
                self._whisper_cli,
                "-m", str(self._model),
                "-f", str(wav_path),
                "-l", self._language,
                "-nt",  # no timestamps
                "-np",  # no progress/status noise
                "--vad",
                "-vm", str(self._vad_model),
            ],
            capture_output=True,
            text=True,
            timeout=self._timeout_s,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(f"whisper-cli failed ({result.returncode}): {result.stderr.strip()}")
        return result.stdout.strip()
