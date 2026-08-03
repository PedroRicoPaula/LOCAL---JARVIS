"""senses/ears/wake_word.py — openWakeWord wrapper: score frames, fire a
callback on detection.

ONNX, not the package's tflite default: tflite-runtime has no solid Apple
Silicon wheel. Confirmed against the installed package (not assumed) that
`inference_framework="onnx"` cleanly falls back and that model files
download correctly via `openwakeword.utils.download_models` — see
PROGRESS.md's Phase 2 log for the exact commands used to verify this,
including a synthetic "hey jarvis" vs. neutral-phrase discrimination test
(0.999 vs. 0.000) before trusting this was wired correctly at all.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

import numpy as np

from senses.ears.config import WAKE_WORD_MODEL, WAKE_WORD_THRESHOLD

OnWake = Callable[[float], None]


class WakeWordDetector(Protocol):
    def score(self, frame: np.ndarray) -> float:
        """Feed one ~80ms frame, get back this model's score for it."""
        ...


class OpenWakeWordDetector:
    def __init__(self, model_name: str = WAKE_WORD_MODEL) -> None:
        # Imported lazily: openwakeword pulls in onnxruntime + scikit-learn,
        # no reason to pay that import cost for callers that never
        # construct this (tests use fakes.py's FakeWakeWordDetector).
        from openwakeword.model import Model

        self._model_name = model_name
        self._model = Model(wakeword_models=[model_name], inference_framework="onnx")

    def score(self, frame: np.ndarray) -> float:
        prediction = self._model.predict(frame)
        return float(prediction[self._model_name])


def watch(
    detector: WakeWordDetector,
    on_wake: OnWake,
    threshold: float = WAKE_WORD_THRESHOLD,
) -> Callable[[np.ndarray], None]:
    """Returns a frame listener to register with a ContinuousAudioSource.
    Fires `on_wake(score)` once per crossing above `threshold`, not once
    per frame — a single utterance produces several consecutive high-score
    frames (confirmed empirically: 8 frames >= 0.9 for one "hey jarvis"),
    and re-firing on every one of them would mean re-triggering mid-wake."""
    above_threshold = False

    def on_frame(frame: np.ndarray) -> None:
        nonlocal above_threshold
        score = detector.score(frame)
        if score >= threshold:
            if not above_threshold:
                on_wake(score)
            above_threshold = True
        else:
            above_threshold = False

    return on_frame
