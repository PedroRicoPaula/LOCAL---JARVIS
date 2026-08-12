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

    def read_raw_frame(self) -> object:
        """Gesture tracking's unencoded path. Returns an opaque marker
        rather than a real numpy array -- nothing in the tested logic
        inspects the frame's contents, only that one was read and handed
        to the tracker, so this fake stays numpy-free."""
        self.read_count += 1
        return f"fake-raw-frame-{self.read_count}"

    def release(self) -> None:
        self.released = True


class FakeHandTracker:
    """Scripted detection results, one per `detect()` call. Same
    "repeats the last item forever" shape as `FakeCameraDevice` above."""

    def __init__(self, results: list[tuple] | None = None) -> None:
        self._results = list(results) if results is not None else [()]
        self.detect_count = 0
        self.closed = False
        self.seen_frames: list[object] = []

    def detect(self, frame: object) -> tuple:
        self.seen_frames.append(frame)
        self.detect_count += 1
        index = min(self.detect_count - 1, len(self._results) - 1)
        return self._results[index]

    def close(self) -> None:
        self.closed = True


class FakeBackgroundBlurrer:
    """Records what it was asked to blur; returns a marker rather than a
    real array, matching `FakeHandTracker`'s own "opaque marker" shape."""

    def __init__(self) -> None:
        self.blurred_frames: list[object] = []
        self.closed = False

    def blur(self, frame: object) -> object:
        self.blurred_frames.append(frame)
        return f"blurred({frame})"

    def close(self) -> None:
        self.closed = True


def fake_clock(start: float = 1_000_000.0) -> tuple[list[float], Callable[[], float]]:
    """Returns a mutable `[now]` box and a `now()` function reading it --
    tests advance time by mutating `box[0]` directly, no real sleeping."""
    box = [start]

    def now() -> float:
        return box[0]

    return box, now
