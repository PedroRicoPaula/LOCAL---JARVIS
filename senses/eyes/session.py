"""senses/eyes/session.py — the ARMED/CAPTURE state machine
(SPEC.md § 6, DECISIONS.md ADR-010):

    IDLE --arm--> ARMED --capture--> CAPTURE --> ARMED (ready for a follow-up)
    ARMED --close (owner/idle/cap)--> IDLE

Pure logic taking a `CameraDevice` and a `now` clock as injected
parameters (same "injectable clock" shape `core/gate/gate.ts`'s own
`decide(response, now: () => number = Date.now())` already uses for
wall-clock timeout logic in this project, translated to Python) rather
than calling `time.time()` directly -- makes idle/absolute-timeout
behavior testable without a real clock or a real camera. `main.py` wires
the real device and real `time.time` together; nothing here touches a
socket.

Invariants enforced here, not left to the caller to get right (ADR-010):
ARMED never means recording (a frame is grabbed only on `capture()`),
every `capture()` re-captures (no frame is ever reused), idle timeout
resets on every capture, absolute timeout never resets.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from senses.eyes import config
from senses.eyes.capture import CameraDevice

CameraState = Literal["idle", "armed"]
CloseCause = Literal["owner", "idle", "cap", "error"]

Clock = Callable[[], float]


@dataclass
class Frame:
    path: Path
    frame_id: str
    captured_at: float


class SessionNotArmedError(RuntimeError):
    """Raised by capture() when the session isn't ARMED -- e.g. a
    follow-up request arriving after an idle-timeout close already fired.
    A real, honest failure the caller (main.py) turns into a spoken
    "the camera closed, want me to open it again?" rather than a silent
    no-op or a crash."""


class CameraSession:
    """One ARMED session. `main.py` creates a new one per `arm()` call,
    holds it until `close()`, and discards it -- there is no "reopen a
    closed session," matching CameraHandle.open()'s own contract in
    shared/types.ts (open() always returns a *new* CameraSession)."""

    def __init__(
        self,
        device: CameraDevice,
        reason: str,
        *,
        now: Clock = time.time,
        idle_timeout_s: float | None = None,
        absolute_timeout_s: float | None = None,
        frames_dir: Path | None = None,
    ) -> None:
        # Resolved here, not as parameter defaults -- a default value is
        # bound once, when this method is first defined (import time), so
        # `config.FRAMES_DIR = X` (what a test's monkeypatch does) would
        # never reach an already-bound default. Reading `config.ATTR`
        # fresh on every call is what actually makes monkeypatching the
        # config module work -- found live, writing this file's own tests.
        self.id = str(uuid.uuid4())
        self.reason = reason
        self._device = device
        self._now = now
        self._idle_timeout_s = (
            idle_timeout_s if idle_timeout_s is not None else config.IDLE_TIMEOUT_S
        )
        absolute_timeout = (
            absolute_timeout_s if absolute_timeout_s is not None else config.ABSOLUTE_TIMEOUT_S
        )
        resolved_frames_dir = frames_dir if frames_dir is not None else config.FRAMES_DIR
        self._frames_dir = resolved_frames_dir / self.id

        self.opened_at = now()
        self.expires_at = self.opened_at + absolute_timeout
        self.idle_until = self.opened_at + self._idle_timeout_s
        self.closed = False
        self.frames: list[Frame] = []

    def is_timed_out(self) -> CloseCause | None:
        """Returns which timeout fired, if any, without side effects --
        `main.py`'s background check calls this on a poll interval and
        closes the session for real when it returns non-None. Absolute
        checked first: if both fire on the same poll, the absolute cap is
        the more informative reason to report."""
        if self.closed:
            return None
        now = self._now()
        if now >= self.expires_at:
            return "cap"
        if now >= self.idle_until:
            return "idle"
        return None

    def capture(self) -> Frame:
        """ARMED -> CAPTURE -> ARMED. Always grabs a fresh frame from the
        real device -- never reuses a previous one (ADR-010: "every
        follow-up request re-captures"). Resets the idle timeout."""
        if self.closed:
            raise SessionNotArmedError(f"session {self.id} is already closed")
        if self.is_timed_out():
            raise SessionNotArmedError(f"session {self.id} has timed out")

        jpeg_bytes = self._device.read_frame()
        frame_id = str(uuid.uuid4())
        self._frames_dir.mkdir(parents=True, exist_ok=True)
        frame_path = self._frames_dir / f"{frame_id}.jpg"
        frame_path.write_bytes(jpeg_bytes)

        frame = Frame(path=frame_path, frame_id=frame_id, captured_at=self._now())
        self.frames.append(frame)
        self.idle_until = self._now() + self._idle_timeout_s
        return frame

    def close(self, cause: CloseCause, keep_frame_ids: frozenset[str] = frozenset()) -> None:
        """ARMED -> IDLE. Deletes every captured frame except the ones
        named in `keep_frame_ids` (the ones an approved observation
        referenced) -- SPEC.md § 6: "frames are ephemeral by default...
        deleted when the session closes unless an observation row
        referencing it was written." Idempotent -- closing an
        already-closed session is a no-op, not an error, since a
        self-triggered idle-timeout close can race a simultaneous
        owner-requested close."""
        if self.closed:
            return
        self.closed = True
        self._device.release()
        for frame in self.frames:
            if frame.frame_id not in keep_frame_ids and frame.path.exists():
                frame.path.unlink()
        if self._frames_dir.exists() and not any(self._frames_dir.iterdir()):
            self._frames_dir.rmdir()
