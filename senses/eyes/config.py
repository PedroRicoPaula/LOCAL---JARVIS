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
