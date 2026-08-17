"""senses/eyes/main.py — camera capture on demand (SPEC.md § 2: "launchd,
idle"). Long-lived server: listens on a Unix socket for `core`, accepts
`{"type": "arm"|"capture"|"close", ...}` requests, emits
`{"type": "camera.armed"|"camera.captured"|"camera.closed", ...}` (and
`{"type": "error", "message": ...}` for a request that can't be honored --
not part of `shared/types.ts`'s `CameraEvent` union, an internal-protocol
detail `core`'s own `CameraHandle` implementation turns into a rejected
promise). No executor imports here, by construction — see
docs/ARCHITECTURE.md § 7.

Only one session at a time (`SessionHolder`) -- SPEC.md § 6's state
machine has no concept of two ARMED sessions at once. A background thread
polls the current session's own timeout check (`CameraSession.
is_timed_out()`) and self-closes it when either the 120s idle or 10min
absolute cap fires -- `eyes` owns and drives this timing itself, `core`
only ever relays what already happened, same as how `core` relays
`voice`'s `speaking` status without owning TTS timing.
"""

from __future__ import annotations

import signal
import socket
import threading
import time
from collections.abc import Callable
from typing import Any

from senses import ipc
from senses.eyes import config
from senses.eyes.capture import CameraDevice, CameraPermissionError, OpenCvCameraDevice
from senses.eyes.gestures import GestureLoop, HandTracker, RealHandTracker
from senses.eyes.pointer import ClickTrigger, PointerBackend, PynputClickTrigger, RealPointerBackend
from senses.eyes.session import CameraSession, SessionNotArmedError
from senses.eyes.state import ConnectionHolder, GestureHolder, SessionHolder

Emit = Callable[[dict[str, Any]], None]
DeviceFactory = Callable[[], CameraDevice]
TrackerFactory = Callable[[], HandTracker]
PointerBackendFactory = Callable[[], PointerBackend]
ClickTriggerFactory = Callable[[], ClickTrigger]


def handle_message(
    message: dict[str, Any],
    holder: SessionHolder,
    device_factory: DeviceFactory,
    emit: Emit,
    gestures: GestureHolder | None = None,
    tracker_factory: TrackerFactory = RealHandTracker,
    pointer_backend_factory: PointerBackendFactory = RealPointerBackend,
    click_trigger_factory: ClickTriggerFactory = PynputClickTrigger,
    spawn: Callable[[Callable[[], None]], None] | None = None,
) -> None:
    """One incoming request, handled. Pure enough to unit-test directly
    with a fake device_factory/emit -- no socket touched here.

    `gestures`/`tracker_factory`/`spawn` are only needed for the
    gesture-mode messages; `spawn` defaults to a real daemon thread and
    is injectable so tests can run the loop synchronously instead.
    `pointer_backend_factory`/`click_trigger_factory` default to the real
    ones (production behaviour unchanged) but tests calling
    `"pointer.control"` MUST override both -- the real
    `click_trigger_factory` starts an actual macOS-wide keyboard
    listener thread the moment `set_pointer_control(True)` runs, found
    live via a segfault from several piling up during a test run."""
    msg_type = message.get("type")

    if msg_type == "arm":
        existing = holder.get()
        if existing is not None and not existing.closed and existing.is_timed_out() is None:
            # Idempotent: re-arming an already-armed session doesn't open
            # a second device connection or reset anything -- just
            # confirms the session that's already live.
            emit({
                "type": "camera.armed",
                "sessionId": existing.id,
                "reason": existing.reason,
                # Wire protocol is epoch-milliseconds throughout (every
                # timestamp in shared/types.ts is Date.now()-based) --
                # session.expires_at is epoch-seconds internally
                # (time.time()'s own convention, needed for is_timed_out()'s
                # comparisons against self._now()). Converting only at the
                # wire boundary, not internally. Found live, Phase 8's own
                # verification pass: the dashboard's countdown read this
                # raw and showed "0s" for a session with 600s left.
                "expiresAt": round(existing.expires_at * 1000),
            })
            return
        reason = str(message.get("reason", ""))
        try:
            device = device_factory()
            device.open()
        except CameraPermissionError as exc:
            emit({"type": "error", "message": str(exc)})
            return
        session = CameraSession(device, reason)
        holder.set(session)
        emit({
            "type": "camera.armed",
            "sessionId": session.id,
            "reason": session.reason,
            "expiresAt": round(session.expires_at * 1000),
        })
        return

    if msg_type == "capture":
        session = holder.get()
        if session is None:
            emit({"type": "error", "message": "no camera session is armed -- arm it first"})
            return
        try:
            frame = session.capture()
        except (SessionNotArmedError, CameraPermissionError) as exc:
            emit({"type": "error", "message": str(exc)})
            return
        emit({
            "type": "camera.captured",
            "sessionId": session.id,
            "frameId": frame.frame_id,
            "path": str(frame.path),
        })
        return

    if msg_type == "close":
        session = holder.get()
        if session is None or session.closed:
            return  # already closed / never armed -- idempotent, not an error
        # Stop gesture tracking first if it's running -- it holds the same
        # device the session about to be closed owns.
        if gestures is not None:
            running = gestures.get()
            if running is not None:
                running.stop()
                gestures.set(None)
        cause = message.get("cause", "owner")
        keep_frame_ids = frozenset(message.get("keepFrameIds", []))
        session.close(cause, keep_frame_ids)
        emit({"type": "camera.closed", "sessionId": session.id, "cause": cause})
        holder.set(None)
        return

    if msg_type == "gesture.start":
        if gestures is None:
            emit({"type": "error", "message": "gesture mode is not available"})
            return
        if gestures.get() is not None:
            emit({"type": "gesture.started"})  # idempotent, same shape as arm
            return
        session = holder.get()
        if session is None or session.closed:
            emit({"type": "error", "message": "no camera session is armed -- arm it first"})
            return
        try:
            tracker = tracker_factory()
        except Exception as exc:
            emit({"type": "error", "message": f"couldn't start hand tracking: {exc}"})
            return
        loop = GestureLoop(
            session.read_raw_frame,
            tracker,
            emit,
            pointer_backend_factory=pointer_backend_factory,
            click_trigger_factory=click_trigger_factory,
        )
        gestures.set(loop)
        emit({"type": "gesture.started"})

        def run_and_clear() -> None:
            try:
                loop.run()
            finally:
                tracker.close()
                if gestures.get() is loop:
                    gestures.set(None)

        if spawn is not None:
            spawn(run_and_clear)
        else:
            threading.Thread(target=run_and_clear, daemon=True).start()
        return

    if msg_type == "gesture.stop":
        if gestures is None:
            return
        running = gestures.get()
        if running is None:
            return  # not running -- idempotent, not an error
        running.stop()
        gestures.set(None)
        return

    if msg_type == "gesture.blur":
        if gestures is None:
            return
        running = gestures.get()
        if running is None:
            return  # nothing to blur if tracking isn't running
        # `is True`, not `bool(...)` -- security review, 2026-08-13:
        # `bool("false")` is `True` in Python, a real trap for anything
        # that could send a JSON string instead of a boolean. The real
        # TypeScript caller always sends a JSON boolean, but a message
        # handler this close to a raw socket shouldn't depend on that.
        running.set_blur(message.get("enabled") is True)
        return

    if msg_type == "pointer.control":
        if gestures is None:
            return
        running = gestures.get()
        if running is None:
            return  # nothing to point with if tracking isn't running
        enabled = message.get("enabled") is True
        running.set_pointer_control(enabled)
        emit({"type": "pointer.control", "enabled": enabled})
        return

    print(f"eyes: ignoring unknown message type {msg_type!r}")


def check_timeouts_forever(
    holder: SessionHolder,
    emit: Emit,
    interval_s: float = config.TIMEOUT_CHECK_INTERVAL_S,
    gestures: GestureHolder | None = None,
) -> None:
    """Background thread: closes the current session for real the moment
    its own idle/absolute deadline passes, even with no capture/close
    request from `core` at all -- SPEC.md § 6's "both timeouts, both
    announced" doesn't wait for the owner to ask."""
    while True:
        time.sleep(interval_s)
        session = holder.get()
        if session is None or session.closed:
            continue
        cause = session.is_timed_out()
        if cause is not None:
            # Stop tracking before releasing the device it's reading from.
            if gestures is not None:
                running = gestures.get()
                if running is not None:
                    running.stop()
                    gestures.set(None)
            session.close(cause)
            emit({"type": "camera.closed", "sessionId": session.id, "cause": cause})
            holder.set(None)


def run_forever(
    conn: socket.socket,
    holder: SessionHolder,
    device_factory: DeviceFactory,
    emit: Emit,
    gestures: GestureHolder | None = None,
) -> None:
    for message in ipc.read_lines(conn):
        try:
            handle_message(message, holder, device_factory, emit, gestures)
        except Exception as exc:  # supervisor boundary -- one bad message must not kill the daemon
            print(f"eyes: failed to handle {message!r}, continuing ({exc!r})")


def _on_sigterm(signum: int, frame: object) -> None:
    """Same reasoning as senses/ears's own _on_sigterm: route SIGTERM
    through KeyboardInterrupt so any open camera device actually gets
    released on shutdown instead of being killed out from under itself."""
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    raise KeyboardInterrupt


def main() -> None:
    signal.signal(signal.SIGTERM, _on_sigterm)
    holder = SessionHolder()
    gestures = GestureHolder()
    connection_holder = ConnectionHolder()

    threading.Thread(
        target=check_timeouts_forever,
        args=(holder, connection_holder.emit, config.TIMEOUT_CHECK_INTERVAL_S, gestures),
        daemon=True,
    ).start()

    server = ipc.listen(config.SOCKET_PATH)
    print(f"eyes: socket ready at {config.SOCKET_PATH}")
    try:
        while True:
            conn = ipc.accept_one(server)
            print("eyes: core connected")
            connection_holder.set(conn)
            run_forever(conn, holder, OpenCvCameraDevice, connection_holder.emit, gestures)
            print("eyes: core disconnected, waiting for reconnect")
    finally:
        running = gestures.get()
        if running is not None:
            running.stop()
        session = holder.get()
        if session is not None and not session.closed:
            session.close("error")


if __name__ == "__main__":
    main()
