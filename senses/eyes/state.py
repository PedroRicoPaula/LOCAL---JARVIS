"""senses/eyes/state.py — the small "one lock, one current thing" state
holders `main.py`'s message loop and background threads share. Split out
of `main.py` 2026-08-17 (CLAUDE.md § 3's ~300-line guideline) -- these
three classes have no protocol/dispatch logic of their own, just guarded
access to shared mutable state, a clean separation from `handle_message`'s
actual request handling.
"""

from __future__ import annotations

import socket
import threading
from typing import Any

from senses import ipc
from senses.eyes.gestures import GestureLoop
from senses.eyes.session import CameraSession


class GestureHolder:
    """The one running gesture loop, if any -- same "one lock, one
    current thing" shape as `SessionHolder` below."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loop: GestureLoop | None = None

    def get(self) -> GestureLoop | None:
        with self._lock:
            return self._loop

    def set(self, loop: GestureLoop | None) -> None:
        with self._lock:
            self._loop = loop


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
