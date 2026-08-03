"""senses/ears/config.py — constants, not a framework. Change values here."""

from __future__ import annotations

import os
from pathlib import Path

from pynput.keyboard import Key

REPO_ROOT = Path(__file__).resolve().parents[2]

# Hold to talk, release to stop. Real root cause of the trouble getting
# here was two stacked macOS/pynput bugs, not the key choice — see
# PROGRESS.md's Phase 1 log for the corrected story (an earlier entry
# blamed a Portuguese-layout dead key; that was a reasonable guess at the
# time but probably wasn't it). Kept Key.tab anyway: a fixed control key,
# identical across every keyboard layout, not part of any accent-
# composition system — no reason to revisit a key that already works.
HOTKEY = Key.tab

SAMPLE_RATE = 16_000
CHANNELS = 1

# Overridable so tests (and a future multi-instance dev setup) don't collide
# with a real running daemon.
SOCKET_PATH = Path(os.environ.get("JARVIS_EARS_SOCKET", "/tmp/jarvis-ears.sock"))

# Explicit native path, not bare "whisper-server" resolved via PATH: this
# machine has two Homebrew installs (an Intel one at /usr/local shadowing
# the native arm64 one at /opt/homebrew in PATH order) and the shadowed
# x86_64 binary runs under Rosetta with no Metal backend at all — see
# PROGRESS.md's Phase 1 log. Override JARVIS_WHISPER_SERVER_BIN if that
# ever changes on your machine.
WHISPER_SERVER_BIN = os.environ.get(
    "JARVIS_WHISPER_SERVER_BIN", "/opt/homebrew/bin/whisper-server"
)
WHISPER_SERVER_HOST = os.environ.get("JARVIS_WHISPER_SERVER_HOST", "127.0.0.1")
WHISPER_SERVER_PORT = int(os.environ.get("JARVIS_WHISPER_SERVER_PORT", "8123"))

# small.en, not large-v3-turbo (ADR-003's original pick): whisper.cpp
# processes a fixed ~30s context window regardless of utterance length, so
# encode cost is roughly constant per model — measured ~2.05s per request
# for large-v3-turbo on this M1 even with the model warm in memory, over
# the DoD's 1.5s budget on its own. small.en: ~0.46s warm, and accuracy on
# the Phase 1 test sentences was indistinguishable (both got every word
# right; large-v3-turbo has no accuracy edge worth 1.6s here). See
# PROGRESS.md's Phase 1 log and DECISIONS.md ADR-003's amendment.
WHISPER_MODEL = Path(
    os.environ.get(
        "JARVIS_WHISPER_MODEL",
        REPO_ROOT / "data/models/whisper/ggml-small.en-q5_1.bin",
    )
)
VAD_MODEL = Path(
    os.environ.get(
        "JARVIS_VAD_MODEL",
        REPO_ROOT / "data/models/whisper/ggml-silero-v5.1.2.bin",
    )
)
LANGUAGE = "en"
