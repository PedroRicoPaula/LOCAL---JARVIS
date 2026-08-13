"""senses/eyes/config.py — constants, not a framework. Change values here."""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Overridable so tests (and a future multi-instance dev setup) don't collide
# with a real running daemon -- same convention as senses/ears/senses/voice's
# own SOCKET_PATH.
SOCKET_PATH = Path(os.environ.get("JARVIS_EYES_SOCKET", "/tmp/jarvis-eyes.sock"))

# Where captured frames land -- gitignored (.gitignore already covers
# data/frames/*.jpg). One subdirectory per session, so `close()` can delete
# an entire session's frames by removing its directory rather than tracking
# individual paths.
FRAMES_DIR = Path(os.environ.get("JARVIS_FRAMES_DIR", REPO_ROOT / "data/frames"))

# Which camera device OpenCV opens -- 0 is "the default camera" on macOS
# (the built-in FaceTime camera on a MacBook, confirmed the standard
# convention, not assumed). Override if a different camera should be used.
CAMERA_DEVICE_INDEX = int(os.environ.get("JARVIS_CAMERA_DEVICE_INDEX", "0"))

# SPEC.md § 6 / DECISIONS.md ADR-010: "two timeouts, both announced. 120s
# idle -> closing the camera. 10 minutes absolute -> same. Both
# configurable, neither removable." Idle resets on every capture; absolute
# is measured from the moment the session opened (ARMED), never reset.
IDLE_TIMEOUT_S = float(os.environ.get("JARVIS_CAMERA_IDLE_TIMEOUT_S", "120"))
ABSOLUTE_TIMEOUT_S = float(os.environ.get("JARVIS_CAMERA_ABSOLUTE_TIMEOUT_S", "600"))

# How often the background timeout check runs -- frequent enough that the
# 120s/600s deadlines above fire close to on time, cheap enough to cost
# nothing idling in a background thread.
TIMEOUT_CHECK_INTERVAL_S = float(os.environ.get("JARVIS_CAMERA_TIMEOUT_CHECK_INTERVAL_S", "1.0"))

# JPEG encode quality for a captured frame (0-100, OpenCV's own scale).
# 85 is a reasonable default for a vision model's own input -- captures
# aren't meant to be archival-quality, they're deleted on session close
# unless an observation was approved.
JPEG_QUALITY = int(os.environ.get("JARVIS_FRAME_JPEG_QUALITY", "85"))

# --- Gesture tracking (2026-08-12) ---------------------------------------
#
# A distinct, explicitly-armed continuous mode -- NOT a loosening of
# SPEC.md § 6's "no frame is captured without an explicit request" rule,
# which governs vision-description captures (a frame written to disk, sent
# to a model, potentially remembered). Gesture tracking never writes a
# frame to disk and never sends one to a model: frames are analyzed in
# memory by a local model and discarded. It still gets its own visible
# session, its own owner-spoken start, and its own timeouts.

# MediaPipe's free, public hand-landmark model (Apache-2.0, Google-hosted,
# no key) -- downloaded once into data/models/, gitignored like every
# other model this project uses (whisper, wake word).
HAND_MODEL_PATH = Path(
    os.environ.get("JARVIS_HAND_MODEL", REPO_ROOT / "data/models/mediapipe/hand_landmarker.task")
)

# Landmark inference rate. 12fps is a deliberate middle ground: fast
# enough that a pinch/drag feels responsive, slow enough to leave real
# headroom on this 8GB M1 (ADR-001's constraint) rather than pinning a
# core. Landmark payloads are tiny (21 points x 2 hands), so this rate
# costs little on the wire.
GESTURE_FPS = float(os.environ.get("JARVIS_GESTURE_FPS", "12"))

# Preview images are the expensive part (base64 JPEG over a socket), so
# they're rate-limited independently of landmark inference -- the skeleton
# overlay is drawn browser-side from landmark data, which is what actually
# needs to feel smooth.
GESTURE_PREVIEW_FPS = float(os.environ.get("JARVIS_GESTURE_PREVIEW_FPS", "4"))
GESTURE_PREVIEW_WIDTH = int(os.environ.get("JARVIS_GESTURE_PREVIEW_WIDTH", "480"))
GESTURE_PREVIEW_JPEG_QUALITY = int(os.environ.get("JARVIS_GESTURE_PREVIEW_QUALITY", "60"))

# Shorter than the camera session's own 120s: gesture mode is an active,
# attention-demanding mode with the camera continuously running, not a
# background one waiting for an occasional question. "Idle" here means no
# hand has been seen at all.
GESTURE_IDLE_TIMEOUT_S = float(os.environ.get("JARVIS_GESTURE_IDLE_TIMEOUT_S", "60"))

# --- Background blur (2026-08-12) ----------------------------------------
#
# Owner-requested, real functional test done before adoption: MediaPipe's
# free, public selfie segmenter (Apache-2.0, Google-hosted, no key) --
# 9ms steady-state against a real image, well inside the preview's own
# 4fps/250ms budget. Applied only to the preview frame (never to landmark
# detection, which needs the real, unblurred pixels) and only when the
# owner turns it on -- the segmenter model is loaded lazily on first
# enable, so leaving it off costs nothing.
SEGMENTER_MODEL_PATH = Path(
    os.environ.get(
        "JARVIS_SEGMENTER_MODEL", REPO_ROOT / "data/models/mediapipe/selfie_segmenter.tflite"
    )
)

# The background is blended toward this colour (OpenCV's BGR order), not
# Gaussian-blurred -- BGR for the dashboard's own `--color-jarvis-bg`
# (#05080f), so an obscured background reads as part of the UI rather
# than an arbitrary dark box.
GESTURE_OBSCURE_BGR = (15, 8, 5)
# How strongly the background is blended toward that colour. High on
# purpose -- owner request 2026-08-12: "completely obscured," not merely
# softened, so it never competes with the overlay drawn on top.
GESTURE_OBSCURE_ALPHA = float(os.environ.get("JARVIS_GESTURE_OBSCURE_ALPHA", "0.92"))

# --- Pointer control (2026-08-12) ----------------------------------------
#
# Real macOS cursor, driven by the index fingertip. Owner-requested, and
# owner-approved specifically in this scoped form after a broader "click
# anywhere, no confirmation" version was refused: CLAUDE.md § 5's own
# red-tier pattern ("a real keystroke fires it") is reused here as a
# structural safety property, not a suggestion -- see pointer.py's own
# docstring. The click-trigger key is deliberately imported lazily
# (pynput.keyboard) alongside its own module, same reasoning as every
# other native-library import in this package.
#
# Was "space" -- a security review (2026-08-13) found Space is the most
# overloaded key on a keyboard (types a character, pauses media,
# activates a focused button), and the listener never suppressed it, so
# an ordinary Space press for an unrelated reason fired a real extra
# click. `ctrl_r` (right Control alone, no other key) types nothing and
# has no bound meaning in virtually any macOS app -- see pointer.py's
# own module docstring for the full finding and the second, independent
# fix (a required pointing pose) alongside this one.
POINTER_CLICK_KEY_NAME = os.environ.get("JARVIS_POINTER_CLICK_KEY", "ctrl_r")
