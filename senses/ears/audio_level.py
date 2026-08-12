"""senses/ears/audio_level.py — real microphone level, for the dashboard's
live waveform.

Rides `ContinuousAudioSource.add_frame_listener` (the same extension point
the wake-word scorer uses) rather than touching `_process_frame`'s own
logic: every ~80ms frame already passes through there, armed or not, so
the level is genuinely live whenever `ears` is running -- not only while
recording.

Throttled hard on purpose. Frames arrive ~12.5/s; sending each one to
`core` (which relays to every dashboard tab) would be a lot of traffic
for a decorative bar, and no one can perceive a level meter updating
faster than ~10/s anyway.
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from typing import Any

import numpy as np

# int16 audio: full scale is 32768. A speaking voice sits well below that,
# so the bar is scaled against a realistic loud-speech level instead --
# otherwise normal speech would barely move it.
FULL_SCALE_RMS = 4000.0

EMIT_INTERVAL_S = 0.1


def rms_to_level(rms: float) -> float:
    """0..1, log-scaled. Linear RMS looks dead for normal speech (loudness
    perception is roughly logarithmic), so this matches what the ear
    actually hears rather than the raw number."""
    if rms <= 0:
        return 0.0
    normalized = min(1.0, rms / FULL_SCALE_RMS)
    # log1p keeps 0 -> 0 while lifting the quiet end into visible range.
    return min(1.0, math.log1p(normalized * 9) / math.log(10))


def make_level_listener(
    emit: Callable[[dict[str, Any]], None],
    now: Callable[[], float] = time.monotonic,
    interval_s: float = EMIT_INTERVAL_S,
) -> Callable[[np.ndarray], None]:
    """Returns a frame listener to register with a `ContinuousAudioSource`.
    Injectable clock/interval so the throttling is testable without real
    time passing."""
    # `None`, not 0.0 -- with a monotonic clock that legitimately starts
    # near zero, a 0.0 sentinel silently swallows the very first frame
    # (caught by this module's own test, not in review).
    last_emit: list[float | None] = [None]

    def on_frame(frame: np.ndarray) -> None:
        current = now()
        if last_emit[0] is not None and current - last_emit[0] < interval_s:
            return
        last_emit[0] = current
        rms = float(np.sqrt(np.mean(frame.astype(np.float64) ** 2)))
        emit({"type": "audio.level", "level": round(rms_to_level(rms), 3)})

    return on_frame
