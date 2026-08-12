"""Fakes only -- no mic, no real time. CLAUDE.md § 3."""

from __future__ import annotations

import numpy as np

from senses.ears.audio_level import FULL_SCALE_RMS, make_level_listener, rms_to_level


def test_silence_is_zero() -> None:
    assert rms_to_level(0.0) == 0.0


def test_full_scale_is_one() -> None:
    assert rms_to_level(FULL_SCALE_RMS) == 1.0


def test_louder_input_always_gives_a_higher_level() -> None:
    levels = [rms_to_level(r) for r in (100, 500, 1000, 2000, 4000)]
    assert levels == sorted(levels)
    assert len(set(levels)) == len(levels), "no two different volumes collapse to the same level"


def test_quiet_speech_is_still_visible_not_crushed_to_zero() -> None:
    """The whole reason for log scaling: at 10% of full scale, a linear
    mapping would give a 3px bar nobody can see."""
    quiet = rms_to_level(FULL_SCALE_RMS * 0.1)
    assert quiet > 0.2, f"log scaling should lift quiet speech into visible range, got {quiet}"


def test_above_full_scale_clamps_rather_than_exceeding_one() -> None:
    assert rms_to_level(FULL_SCALE_RMS * 10) == 1.0


def test_listener_emits_a_level_for_a_real_frame() -> None:
    emitted: list[dict] = []
    clock = [0.0]
    listener = make_level_listener(emitted.append, now=lambda: clock[0], interval_s=0.1)

    listener(np.full(1280, 2000, dtype=np.int16))

    assert len(emitted) == 1
    assert emitted[0]["type"] == "audio.level"
    assert 0 < emitted[0]["level"] <= 1


def test_listener_throttles_rather_than_emitting_every_frame() -> None:
    """Frames arrive ~12.5/s; every one reaching every dashboard tab
    would be a lot of traffic for a decorative bar."""
    emitted: list[dict] = []
    clock = [0.0]
    listener = make_level_listener(emitted.append, now=lambda: clock[0], interval_s=0.1)
    frame = np.full(1280, 2000, dtype=np.int16)

    listener(frame)  # t=0, emits
    clock[0] = 0.05
    listener(frame)  # too soon
    clock[0] = 0.09
    listener(frame)  # still too soon

    assert len(emitted) == 1

    clock[0] = 0.11
    listener(frame)  # past the interval

    assert len(emitted) == 2
