"""senses/eyes/handTracker.py — hand-landmark detection. Split out of
`gestures.py` 2026-08-17 (CLAUDE.md § 3's ~300-line guideline): the
landmark data shapes and MediaPipe detector are one coherent, reusable
concern, independent of `GestureLoop`'s own orchestration logic.

`mediapipe`/`cv2` are imported lazily inside `RealHandTracker`, not at
module import -- same reasoning as `senses/ears/wake_word.py`'s lazy
`openwakeword` import: tests use a fake tracker and must never pay a
~1s native-library import cost (or require the dependency at all).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

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
    image is mirrored for the owner's own sanity (see `gestures.mirror_frame`)."""

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
