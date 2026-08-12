"""Fakes only -- no real cursor, no real keyboard. CLAUDE.md § 3."""

from __future__ import annotations

from senses.eyes.pointer import map_to_screen


def test_maps_top_left_corner() -> None:
    assert map_to_screen(0.0, 0.0, 1440.0, 900.0) == (0.0, 0.0)


def test_maps_bottom_right_corner() -> None:
    assert map_to_screen(1.0, 1.0, 1440.0, 900.0) == (1440.0, 900.0)


def test_maps_centre() -> None:
    assert map_to_screen(0.5, 0.5, 1440.0, 900.0) == (720.0, 450.0)


def test_clamps_below_zero_rather_than_moving_off_screen() -> None:
    """A landmark can legitimately read slightly negative near a frame
    edge (MediaPipe doesn't hard-clip) -- the cursor must never be asked
    to go somewhere off-screen."""
    assert map_to_screen(-0.05, -0.05, 1440.0, 900.0) == (0.0, 0.0)


def test_clamps_above_one_rather_than_moving_off_screen() -> None:
    assert map_to_screen(1.05, 1.05, 1440.0, 900.0) == (1440.0, 900.0)


def test_scales_to_a_different_real_screen_size() -> None:
    assert map_to_screen(0.5, 0.5, 2560.0, 1440.0) == (1280.0, 720.0)
