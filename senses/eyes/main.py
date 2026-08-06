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
from senses.eyes.session import CameraSession, SessionNotArmedError

Emit = Callable[[dict[str, Any]], None]
DeviceFactory = Callable[[], CameraDevice]


class SessionHolder:
    """The one current session, if any -- shared by the message-handling
    loop and the background timeout thread, guarded by one lock (same
    "one lock, no queueing, simultaneous use is an edge case not worth
    solving now" reasoning `senses/ears`'s own `busy_lock` already
    established for a different kind of concurrency)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._session: CameraSession | None = None

    def get(self) -> CameraSession | None:
        with self._lock:
            return self._session

    def set(self, session: CameraSession | None) -> None:
        with self._lock:
            self._session = session


def handle_message(
    message: dict[str, Any],
    holder: SessionHolder,
    device_factory: DeviceFactory,
    emit: Emit,
) -> None:
    """One incoming request, handled. Pure enough to unit-test directly
    with a fake device_factory/emit -- no socket touched here."""
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
                "expiresAt": existing.expires_at,
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
            "expiresAt": session.expires_at,
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
        cause = message.get("cause", "owner")
        keep_frame_ids = frozenset(message.get("keepFrameIds", []))
        session.close(cause, keep_frame_ids)
        emit({"type": "camera.closed", "sessionId": session.id, "cause": cause})
        holder.set(None)
        return

    print(f"eyes: ignoring unknown message type {msg_type!r}")


def check_timeouts_forever(
    holder: SessionHolder, emit: Emit, interval_s: float = config.TIMEOUT_CHECK_INTERVAL_S
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
            session.close(cause)
            emit({"type": "camera.closed", "sessionId": session.id, "cause": cause})
            holder.set(None)


class ConnectionHolder:
    """The core connection, swappable across reconnects -- identical
    shape to senses/ears's own ConnectionHolder (a real, if small,
    duplication across senses/* daemons; each one stays independently
    readable rather than sharing a cross-cutting module for four lines
    of logic, matching this project's own "boring over DRY" call in
    core/router/providers/openaiCompatible.ts's docstring)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._conn: socket.socket | None = None

    def set(self, conn: socket.socket) -> None:
        with self._lock:
            self._conn = conn

    def emit(self, message: dict[str, Any]) -> None:
        with self._lock:
            conn = self._conn
        if conn is None:
            print(f"eyes: no core connected, dropping {message.get('type', '')!r}")
            return
        try:
            ipc.send_line(conn, message)
        except (BrokenPipeError, ConnectionResetError):
            print("eyes: core disconnected")
            with self._lock:
                if self._conn is conn:
                    self._conn = None


def run_forever(
    conn: socket.socket, holder: SessionHolder, device_factory: DeviceFactory, emit: Emit
) -> None:
    for message in ipc.read_lines(conn):
        try:
            handle_message(message, holder, device_factory, emit)
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
    connection_holder = ConnectionHolder()

    threading.Thread(
        target=check_timeouts_forever, args=(holder, connection_holder.emit), daemon=True
    ).start()

    server = ipc.listen(config.SOCKET_PATH)
    print(f"eyes: socket ready at {config.SOCKET_PATH}")
    try:
        while True:
            conn = ipc.accept_one(server)
            print("eyes: core connected")
            connection_holder.set(conn)
            run_forever(conn, holder, OpenCvCameraDevice, connection_holder.emit)
            print("eyes: core disconnected, waiting for reconnect")
    finally:
        session = holder.get()
        if session is not None and not session.closed:
            session.close("error")


if __name__ == "__main__":
    main()
