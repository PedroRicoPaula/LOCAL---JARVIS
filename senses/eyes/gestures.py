"""senses/eyes/gestures.py — continuous hand-landmark tracking.

**Not a loosening of SPEC.md § 6's "no frame is captured without an
explicit request."** That rule governs *vision-description* captures: a
frame written to `data/frames/`, sent to a remote vision model, possibly
remembered as an observation. Gesture tracking does none of those things
-- frames are analyzed in memory by a local model and dropped, nothing
is written to disk, nothing leaves the machine. It still gets an
explicitly-armed session, an owner-spoken start, a visible dashboard
indicator, and its own idle timeout, so the camera can never be quietly
running.

MediaPipe's `HandLandmarker` runs fully locally (CLAUDE.md § 0.2: free,
offline) on a free Apache-2.0 model. Verified real before this module
was written: 21 landmarks per hand, correct handedness, 0.94-0.96
confidence against a real test image, GPU (Metal) delegate active on
this M1.

`mediapipe` and `cv2` are imported lazily inside `RealHandTracker`, not
at module import -- same reasoning as `senses/ears/wake_word.py`'s lazy
`openwakeword` import: tests use `FakeHandTracker` and must never pay a
~1s native-library import cost (or require the dependency at all).
"""

from __future__ import annotations

import base64
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

import numpy as np

from senses.eyes import config


@dataclass(frozen=True)
class Landmark:
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class Hand:
    """One detected hand. `handedness` is MediaPipe's own "Left"/"Right"
    label; note it describes the *real* hand as seen, while the preview
    image is mirrored for the owner's own sanity (see `mirror_frame`)."""

    handedness: str
    landmarks: tuple[Landmark, ...]


class HandTracker(Protocol):
    def detect(self, frame: Any) -> tuple[Hand, ...]:
        """One raw BGR frame in, detected hands out. Empty tuple means no
        hand was visible -- a normal, frequent case, never an error."""
        ...

    def close(self) -> None: ...


class RealHandTracker:
    def __init__(self, model_path: str | None = None) -> None:
        import cv2
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        self._cv2 = cv2
        self._mp = mp
        base_options = mp_python.BaseOptions(
            model_asset_path=str(model_path or config.HAND_MODEL_PATH)
        )
        options = vision.HandLandmarkerOptions(base_options=base_options, num_hands=2)
        self._detector = vision.HandLandmarker.create_from_options(options)

    def detect(self, frame: Any) -> tuple[Hand, ...]:
        rgb = self._cv2.cvtColor(frame, self._cv2.COLOR_BGR2RGB)
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        result = self._detector.detect(image)
        hands: list[Hand] = []
        for i, landmarks in enumerate(result.hand_landmarks):
            handedness = "Unknown"
            if i < len(result.handedness) and result.handedness[i]:
                handedness = result.handedness[i][0].category_name
            hands.append(
                Hand(
                    handedness=handedness,
                    landmarks=tuple(Landmark(lm.x, lm.y, lm.z) for lm in landmarks),
                )
            )
        return tuple(hands)

    def close(self) -> None:
        self._detector.close()


def mirror_frame(frame: Any) -> Any:
    """Horizontally flips the preview so the owner sees themselves as in
    a mirror -- moving a hand right moves it right on screen. Without
    this, every interaction feels inverted. Applied to the *preview image
    only*; landmark x-coordinates are mirrored separately (below) so both
    halves agree."""
    import cv2

    return cv2.flip(frame, 1)


def mirror_hands(hands: tuple[Hand, ...]) -> tuple[Hand, ...]:
    """Mirrors landmark x-coordinates to match `mirror_frame`'s preview.
    MediaPipe's normalized coordinates are 0..1 left-to-right, so a
    mirror is just `1 - x`."""
    return tuple(
        Hand(
            handedness=h.handedness,
            landmarks=tuple(Landmark(1.0 - lm.x, lm.y, lm.z) for lm in h.landmarks),
        )
        for h in hands
    )


class BackgroundBlurrer(Protocol):
    def blur(self, frame: Any) -> Any:
        """Person sharp, everything else blurred. Never called on the
        frame handed to hand detection -- only on the preview copy."""
        ...

    def close(self) -> None: ...


class RealBackgroundBlurrer:
    """MediaPipe's selfie segmenter, same free/local/Apache-2.0 stack as
    hand tracking. Verified real before adoption: 9ms steady-state
    against a real image (250ms preview budget at 4fps), category 0 =
    person / 255 = background confirmed against a real mask, not
    assumed from the model card."""

    def __init__(self, model_path: str | None = None) -> None:
        import cv2
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        self._cv2 = cv2
        self._mp = mp
        base_options = mp_python.BaseOptions(
            model_asset_path=str(model_path or config.SEGMENTER_MODEL_PATH)
        )
        options = vision.ImageSegmenterOptions(base_options=base_options, output_category_mask=True)
        self._segmenter = vision.ImageSegmenter.create_from_options(options)

    def blur(self, frame: Any) -> Any:
        cv2 = self._cv2
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        # numpy_view() already comes back (H, W, 1) -- found live, not
        # assumed: appending another axis for the broadcast gave
        # (H, W, 1, 1) against the frame's (H, W, 3) and raised.
        mask = self._segmenter.segment(image).category_mask.numpy_view()
        k = config.GESTURE_BLUR_KERNEL
        blurred = cv2.GaussianBlur(frame, (k, k), 0)
        is_person = mask.reshape(mask.shape[0], mask.shape[1], 1) == 0
        return np.where(is_person, frame, blurred)

    def close(self) -> None:
        self._segmenter.close()


def encode_preview(frame: Any, width: int, quality: int) -> str:
    """Downscaled, base64 JPEG for the dashboard's live preview. Small on
    purpose -- this crosses a socket several times a second, and the
    skeleton overlay is drawn browser-side from landmark data rather than
    burned into this image."""
    import cv2

    h, w = frame.shape[:2]
    if w > width:
        frame = cv2.resize(frame, (width, round(h * width / w)))
    ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("failed to JPEG-encode a gesture preview frame")
    return base64.b64encode(buffer.tobytes()).decode("ascii")


def hands_to_wire(hands: tuple[Hand, ...]) -> list[dict[str, Any]]:
    return [
        {
            "handedness": h.handedness,
            "landmarks": [
                {"x": round(lm.x, 4), "y": round(lm.y, 4), "z": round(lm.z, 4)}
                for lm in h.landmarks
            ],
        }
        for h in hands
    ]


class GestureLoop:
    """Owns the tracking thread. Started/stopped by `main.py`'s message
    handler; runs until stopped or its own no-hand-seen idle timeout
    fires (the camera should never sit running because the owner walked
    away and forgot).

    Every collaborator is injected -- `read_raw_frame`, the tracker, the
    clock, and `sleep` -- so the whole loop is unit-testable with no
    camera, no mediapipe, and no real elapsed time (CLAUDE.md § 3).
    """

    def __init__(
        self,
        read_raw_frame: Callable[[], Any],
        tracker: HandTracker,
        emit: Callable[[dict[str, Any]], None],
        *,
        fps: float = config.GESTURE_FPS,
        preview_fps: float = config.GESTURE_PREVIEW_FPS,
        idle_timeout_s: float = config.GESTURE_IDLE_TIMEOUT_S,
        now: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        encode: Callable[[Any], str] | None = None,
        mirror: Callable[[Any], Any] = mirror_frame,
        blurrer_factory: Callable[[], BackgroundBlurrer] = RealBackgroundBlurrer,
    ) -> None:
        self._read_raw_frame = read_raw_frame
        self._tracker = tracker
        self._emit = emit
        self._interval = 1.0 / fps
        self._preview_interval = 1.0 / preview_fps
        self._idle_timeout_s = idle_timeout_s
        self._now = now
        self._sleep = sleep
        self._encode = encode or (
            lambda f: encode_preview(
                f, config.GESTURE_PREVIEW_WIDTH, config.GESTURE_PREVIEW_JPEG_QUALITY
            )
        )
        self._mirror = mirror
        self._blurrer_factory = blurrer_factory
        self._blurrer: BackgroundBlurrer | None = None
        self._blur_enabled = threading.Event()
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    @property
    def stopped(self) -> bool:
        return self._stop.is_set()

    def set_blur(self, enabled: bool) -> None:
        """Toggled from `main.py`'s message handler, read by the run()
        loop on whichever thread is running it -- the segmenter is built
        lazily on first enable so leaving blur off never pays its
        (small) model-load cost."""
        if enabled:
            self._blur_enabled.set()
        else:
            self._blur_enabled.clear()

    @property
    def blur_enabled(self) -> bool:
        return self._blur_enabled.is_set()

    def run(self) -> None:
        """Blocks until stopped or idle-timed-out. `main.py` runs this on
        its own thread."""
        try:
            self._run()
        finally:
            if self._blurrer is not None:
                self._blurrer.close()
                self._blurrer = None

    def _run(self) -> None:
        started_at = self._now()
        last_hand_seen_at = started_at
        last_preview_at = 0.0

        while not self._stop.is_set():
            frame_started_at = self._now()
            try:
                frame = self._read_raw_frame()
            except Exception as exc:  # supervisor boundary -- same shape as ears's safe_run
                self._emit({"type": "error", "message": f"gesture capture failed: {exc}"})
                self._emit({"type": "gesture.stopped", "cause": "error"})
                return

            # Detect on the *raw* frame, then mirror the landmarks once.
            # Bug found live 2026-08-12 (owner: "the hand connecting
            # points are on the other side"): this used to mirror the
            # frame *before* calling detect(), so the landmarks came back
            # already in mirrored space -- then `mirror_hands` mirrored
            # them a second time, cancelling back to the *unmirrored*
            # coordinates while the preview image stayed mirrored. Net
            # effect: skeleton drawn on the opposite side of the hand it
            # belonged to. One flip, applied once, to each.
            hands = mirror_hands(self._tracker.detect(frame))
            frame = self._mirror(frame)
            now = self._now()

            if hands:
                last_hand_seen_at = now
            elif now - last_hand_seen_at > self._idle_timeout_s:
                self._emit({"type": "gesture.stopped", "cause": "idle"})
                return

            self._emit({"type": "hand.landmarks", "hands": hands_to_wire(hands), "ts": now})

            if now - last_preview_at >= self._preview_interval:
                last_preview_at = now
                preview_frame = frame
                if self._blur_enabled.is_set():
                    try:
                        if self._blurrer is None:
                            self._blurrer = self._blurrer_factory()
                        preview_frame = self._blurrer.blur(frame)
                    except Exception as exc:
                        # Same reasoning as the encode failure below --
                        # blur is cosmetic, tracking must keep working.
                        print(f"eyes: gesture background blur failed, continuing ({exc!r})")
                try:
                    self._emit({"type": "hand.preview", "image": self._encode(preview_frame)})
                except Exception as exc:
                    # A preview encode failing is cosmetic -- landmark
                    # tracking (the part that actually drives interaction)
                    # keeps working. Logged, not fatal.
                    print(f"eyes: gesture preview encode failed, continuing ({exc!r})")

            # Sleep only the *remainder* of the frame budget, not a full
            # interval on top of the work already done -- found live,
            # 2026-08-12: a fixed sleep made the real achieved rate
            # 1/(work + interval), measured at 7.4fps against a 12fps
            # target (detection alone is ~41ms on this machine). Clamped
            # at 0 so a slow frame simply runs back-to-back rather than
            # sleeping a negative amount.
            self._sleep(max(0.0, self._interval - (self._now() - frame_started_at)))

        self._emit({"type": "gesture.stopped", "cause": "owner"})
