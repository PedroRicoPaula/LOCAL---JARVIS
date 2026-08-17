"""senses/eyes/blur.py — background obscuring for the gesture preview.
Split out of `gestures.py` 2026-08-17 (CLAUDE.md § 3's ~300-line
guideline): a self-contained image-processing concern, independent of
`GestureLoop`'s own orchestration logic.
"""

from __future__ import annotations

from typing import Any, Protocol

import numpy as np

from senses.eyes import config


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
        is_person = mask.reshape(mask.shape[0], mask.shape[1], 1) == 0
        # Blended toward the dashboard's own background colour, not a
        # Gaussian blur -- owner request 2026-08-12: the background
        # should read as *completely* obscured (nothing legible behind
        # the person) so it never competes visually with the shapes/
        # skeleton overlay drawn on top. A weighted blend is also
        # cheaper than a 35px Gaussian convolution -- this happened to
        # fix a real CPU cost, not just a look, once the frame was also
        # downscaled before this runs (see gestures.resize_for_preview's
        # own note for the measured before/after).
        dark = np.full_like(frame, config.GESTURE_OBSCURE_BGR)
        alpha = config.GESTURE_OBSCURE_ALPHA
        obscured = cv2.addWeighted(frame, 1.0 - alpha, dark, alpha, 0)
        return np.where(is_person, frame, obscured)

    def close(self) -> None:
        self._segmenter.close()
