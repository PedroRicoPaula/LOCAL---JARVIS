"""senses/ears/transcribe.py — WAV file in, text out. Talks HTTP to a
resident whisper_server.py process rather than spawning whisper-cli per
utterance — see that module's docstring for why the difference is ~1.6s,
not a micro-optimization. Its own --vad flag runs the same Silero VAD
model ADR-003 calls for without a second ML runtime in Python. See
DECISIONS.md ADR-001 for why keeping this machine's dependency footprint
small is not optional politeness."""

from __future__ import annotations

import json
import mimetypes
import re
import uuid
from pathlib import Path
from typing import Protocol
from urllib.request import Request, urlopen

from senses.ears.whisper_server import BASE_URL

INFERENCE_PATH = "/inference"

# whisper.cpp's own placeholder for "no discernible speech" — confirmed
# live (Pedro's testing produced a literal "[BLANK_AUDIO]" transcription
# for a wake-word-triggered capture with no real command in it). Without
# this filter that string gets treated as a real utterance and spoken back
# — never guessed at applies to whisper's own non-speech markers too, not
# just to genuinely empty output.
_NON_SPEECH_MARKER = re.compile(r"^[\[(].*[\])]$")


class Transcriber(Protocol):
    def transcribe(self, wav_path: Path) -> str:
        """Empty string means no speech was detected — never guessed at."""
        ...


def _multipart_body(wav_path: Path, boundary: str) -> bytes:
    content_type = mimetypes.guess_type(wav_path.name)[0] or "audio/wav"
    header = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{wav_path.name}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode()
    footer = f"\r\n--{boundary}--\r\n".encode()
    return header + wav_path.read_bytes() + footer


class WhisperServerTranscriber:
    def __init__(self, base_url: str = BASE_URL, timeout_s: float = 10.0) -> None:
        self._url = f"{base_url}{INFERENCE_PATH}"
        self._timeout_s = timeout_s

    def transcribe(self, wav_path: Path) -> str:
        boundary = uuid.uuid4().hex
        body = _multipart_body(wav_path, boundary)
        request = Request(
            self._url,
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        try:
            with urlopen(request, timeout=self._timeout_s) as response:
                result = json.load(response)
        except OSError as exc:
            raise RuntimeError(f"whisper-server request failed: {exc}") from exc

        text = result.get("text", "").strip()
        if _NON_SPEECH_MARKER.match(text):
            return ""
        return text
