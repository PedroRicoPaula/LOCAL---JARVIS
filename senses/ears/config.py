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

# --- Phase 2: wake word --------------------------------------------------

# 80ms frames (1280 samples at 16kHz) is openWakeWord's own recommended
# chunk size — confirmed against the installed package, not assumed.
WAKE_WORD_FRAME_SAMPLES = 1_280

WAKE_WORD_MODEL = os.environ.get("JARVIS_WAKE_WORD_MODEL", "hey_jarvis")
# ADR-005: pretrained default. Real starting point, not a guess — the DoD's
# own 30-activation test is the tuning session; adjust from the scores it
# logs, not blind. onnxruntime, not tflite (tflite-runtime has no solid
# Apple Silicon wheel — see PROGRESS.md's Phase 2 log).
WAKE_WORD_THRESHOLD = float(os.environ.get("JARVIS_WAKE_WORD_THRESHOLD", "0.5"))

# Safety cap for wake_word.watch()'s falling-edge trigger (see that
# module): if the score somehow never drops back below threshold, fire
# anyway after this many consecutive above-threshold frames rather than
# never triggering at all. One real utterance sustains ~8 frames >= 0.9
# (confirmed empirically) — 20 frames (1.6s) is a generous multiple of that.
WAKE_WORD_MAX_FRAMES_ABOVE = 20

# Auto-stop for wake-word-triggered recording (push-to-talk's end signal is
# the key release; there's no key here). Energy-based, not a second VAD
# pipeline — see ADR-014's reasoning, same logic applies. Frame = 80ms:
# ~320ms grace before silence counts (people pause right after "hey
# jarvis"), trailing silence to confirm they're actually done, hard cap so
# a stuck mic can't record forever.
#
# SILENCE_FRAMES_TO_STOP started at 10 (800ms) and cut Pedro off mid-
# sentence on ordinary thinking/breath pauses in natural (non-scripted,
# non-native-English-cadence) speech — confirmed live, see PROGRESS.md's
# Phase 2 log. Raised to 25 (2.0s), confirmed fixed against sentences with
# several internal pauses/commas. Both env-overridable so this can be
# tuned further from real use without a code change.
#
# MAX_RECORDING_FRAMES started at 100 (8s), then 200 (16s) — still too
# tight: ~40-word test sentences (~16s at natural pace) were hitting the
# cap and getting cut right near the end, confirmed live (same long
# sentence, cut in roughly the same place on repeated attempts — not
# random, a hard ceiling). Raised to 400 (32s), generous headroom for a
# genuinely long command while still bounding a stuck-mic worst case.
MIN_SPEECH_FRAMES = 4
SILENCE_FRAMES_TO_STOP = int(os.environ.get("JARVIS_SILENCE_FRAMES_TO_STOP", "25"))
MAX_RECORDING_FRAMES = int(os.environ.get("JARVIS_MAX_RECORDING_FRAMES", "400"))
SILENCE_RMS_THRESHOLD = float(os.environ.get("JARVIS_SILENCE_RMS_THRESHOLD", "150"))

# Reflex-lane ack (SPEC.md § 3: <300ms budget) — a system sound, not `say`;
# see PROGRESS.md's Phase 2 log for why.
ACK_SOUND = os.environ.get("JARVIS_ACK_SOUND", "/System/Library/Sounds/Tink.aiff")
ACK_NOTIFICATION_TEXT = "Listening..."
