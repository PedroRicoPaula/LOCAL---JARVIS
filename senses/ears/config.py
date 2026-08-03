"""senses/ears/config.py — constants, not a framework. Change values here."""

from __future__ import annotations

import os
from pathlib import Path

from pynput.keyboard import Key

REPO_ROOT = Path(__file__).resolve().parents[2]

# Hold to talk, release to stop. Right Option doesn't collide with normal
# typing and is comfortable to hold. Change here if it fights something else
# on your keyboard.
HOTKEY = Key.alt_r

SAMPLE_RATE = 16_000
CHANNELS = 1

# Overridable so tests (and a future multi-instance dev setup) don't collide
# with a real running daemon.
SOCKET_PATH = Path(os.environ.get("JARVIS_EARS_SOCKET", "/tmp/jarvis-ears.sock"))

# Explicit native path, not bare "whisper-cli" resolved via PATH: this
# machine has two Homebrew installs (an Intel one at /usr/local shadowing
# the native arm64 one at /opt/homebrew in PATH order) and the shadowed
# x86_64 binary runs under Rosetta with no Metal backend at all — see
# PROGRESS.md's Phase 1 log. Override JARVIS_WHISPER_CLI if that ever
# changes on your machine.
WHISPER_CLI = os.environ.get("JARVIS_WHISPER_CLI", "/opt/homebrew/bin/whisper-cli")
WHISPER_MODEL = Path(
    os.environ.get(
        "JARVIS_WHISPER_MODEL",
        REPO_ROOT / "data/models/whisper/ggml-large-v3-turbo-q5_0.bin",
    )
)
VAD_MODEL = Path(
    os.environ.get(
        "JARVIS_VAD_MODEL",
        REPO_ROOT / "data/models/whisper/ggml-silero-v5.1.2.bin",
    )
)
LANGUAGE = "en"
