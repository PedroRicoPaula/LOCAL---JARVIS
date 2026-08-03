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

from senses.ears.config import (
    WAKE_WORD_MAX_FRAMES_ABOVE,
    WAKE_WORD_MODEL,
    WAKE_WORD_THRESHOLD,
)

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
    max_frames_above: int = WAKE_WORD_MAX_FRAMES_ABOVE,
) -> Callable[[np.ndarray], None]:
    """Returns a frame listener to register with a ContinuousAudioSource.

    Fires `on_wake(peak_score)` on the FALLING edge — once the wake phrase
    has finished being said, not the instant it starts. Firing on the
    rising edge (the first version of this function) was arming the
    recorder mid-word, capturing the tail of "jarvis" itself as the start
    of the recorded command — confirmed via Pedro's live testing, where
    "Hey Jarvis, what's the weather" came back transcribed as things like
    "HRVs are you listening to me?" and "Charfis". Waiting for the score to
    drop back down means recording starts cleanly after the wake phrase
    ends. `max_frames_above` is a safety net in case the score never drops
    (shouldn't happen — one utterance sustains ~8 frames >= 0.9 empirically
    — but a wake-word detector that can permanently stop triggering is a
    worse failure mode than firing a little late)."""
    above_threshold = False
    peak_score = 0.0
    frames_above = 0

    def on_frame(frame: np.ndarray) -> None:
        nonlocal above_threshold, peak_score, frames_above
        score = detector.score(frame)
        above = score >= threshold

        if above:
            peak_score = max(peak_score, score)
            frames_above += 1

        fire = (above_threshold and not above) or (above and frames_above >= max_frames_above)
        if fire:
            on_wake(peak_score)
            peak_score = 0.0
            frames_above = 0
            above_threshold = False
            return

        above_threshold = above
        if not above:
            frames_above = 0

    return on_frame
