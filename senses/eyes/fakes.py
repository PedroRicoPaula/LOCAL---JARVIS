"""senses/eyes/fakes.py — test doubles for everything that touches the
outside world. Per CLAUDE.md § 3: tests must pass with no camera, no
network."""

from __future__ import annotations

from collections.abc import Callable

from senses.eyes.capture import CameraPermissionError


class FakeCameraDevice:
    """Scripted frame bytes, one per `read_frame()` call, matching
    `senses/ears/fakes.py`'s `FakeTranscriber`-style "scripted return
    value, records what was asked" shape."""

    def __init__(self, frames: list[bytes] | None = None, fail_to_open: bool = False) -> None:
        # Repeats the last frame forever once the scripted list is
        # exhausted, rather than erroring -- most tests only care that
        # each capture() call asked the device for a frame at all
        # (proving "every follow-up re-captures, nothing is cached" on
        # the *caller's* side), not that this fake ran out of scripted
        # variety. Pass distinct bytes per call when a test needs to
        # assert on which specific frame came back.
        self._frames = list(frames) if frames is not None else [b"fake-jpeg-bytes"]
        self._fail_to_open = fail_to_open
        self.opened = False
        self.released = False
        self.read_count = 0

    def open(self) -> None:
        if self._fail_to_open:
            raise CameraPermissionError("fake: camera permission denied")
        self.opened = True

    def read_frame(self) -> bytes:
        self.read_count += 1
        index = min(self.read_count - 1, len(self._frames) - 1)
        return self._frames[index]

    def release(self) -> None:
        self.released = True


def fake_clock(start: float = 1_000_000.0) -> tuple[list[float], Callable[[], float]]:
    """Returns a mutable `[now]` box and a `now()` function reading it --
    tests advance time by mutating `box[0]` directly, no real sleeping."""
    box = [start]

    def now() -> float:
        return box[0]

    return box, now
