"""senses/ears/whisper_server.py — starts and stops the whisper-server
subprocess that transcribe.py talks to over HTTP.

Why a server instead of one whisper-cli call per utterance: whisper.cpp
processes a fixed-size context window per call regardless of audio length,
so spawning a fresh process every time means paying full model-load +
encode cost on every single utterance. Measured ~3.2s cold on this machine
— more than double the Phase 1 DoD's 1.5s budget. A resident server keeps
the model loaded once; see PROGRESS.md's Phase 1 log for the numbers.
"""

from __future__ import annotations

import subprocess
import time
import urllib.error
import urllib.request

from senses.ears.config import (
    LANGUAGE,
    VAD_MODEL,
    WHISPER_INITIAL_PROMPT,
    WHISPER_MODEL,
    WHISPER_SERVER_BIN,
    WHISPER_SERVER_HOST,
    WHISPER_SERVER_PORT,
)

BASE_URL = f"http://{WHISPER_SERVER_HOST}:{WHISPER_SERVER_PORT}"


def start() -> subprocess.Popen:
    """Launches whisper-server. Caller must wait_until_ready() before
    sending inference requests, and stop() when done."""
    return subprocess.Popen(
        [
            WHISPER_SERVER_BIN,
            "-m", str(WHISPER_MODEL),
            "--vad", "-vm", str(VAD_MODEL),
            "-l", LANGUAGE,
            # `--carry-initial-prompt`: without it, `--prompt` only biases
            # the *first* /inference call this server ever handles --
            # `ears` is a long-lived daemon serving many utterances over
            # its whole lifetime, so every one needs the vocabulary hint,
            # not just the first (confirmed against whisper-server's own
            # --help text, not assumed).
            "--prompt", WHISPER_INITIAL_PROMPT,
            "--carry-initial-prompt",
            "--host", WHISPER_SERVER_HOST,
            "--port", str(WHISPER_SERVER_PORT),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wait_until_ready(timeout_s: float = 60.0) -> None:
    """Polls until the server answers, or raises TimeoutError. Model load
    (a few seconds, dominated by disk read + Metal shader compile on first
    run) happens before the server starts listening, so a plain HTTP
    reachability check is a sufficient readiness signal."""
    deadline = time.monotonic() + timeout_s
    last_error: OSError | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(BASE_URL, timeout=2.0):
                return
        except (urllib.error.URLError, OSError) as exc:
            last_error = exc
            time.sleep(0.5)
    raise TimeoutError(f"whisper-server did not become ready within {timeout_s}s: {last_error}")


def stop(process: subprocess.Popen, timeout_s: float = 5.0) -> None:
    process.terminate()
    try:
        process.wait(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
