"""
senses/ipc.py — the tiny Unix-socket, newline-delimited-JSON transport that
ears, voice and (for Phase 1 only) echo_bridge speak to each other with.

Mirrors the ServerEvent/ClientEvent message shape in shared/types.ts for
consistency, even though this isn't the WebSocket to ui/ — same convention,
different transport. `ears` and `voice` are servers (they sit and wait,
launchd-style); whoever orchestrates them (the Phase 1 echo bridge today,
core/ from Phase 3 on) is the client that connects out to both.
"""

from __future__ import annotations

import json
import os
import socket
from collections.abc import Iterator
from pathlib import Path
from typing import Any


def listen(socket_path: Path) -> socket.socket:
    """Bind and listen on a Unix socket, removing a stale one first."""
    if socket_path.exists():
        os.unlink(socket_path)
    socket_path.parent.mkdir(parents=True, exist_ok=True)
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.bind(str(socket_path))
    # Owner read/write only. Security review, 2026-08-13: an unauthenticated
    # local socket is a real, if bounded, risk now that eyes accepts
    # messages (arm/gesture.start/pointer.control) that can drive the real
    # camera and cursor -- the accepted mitigation is "the next local
    # connection can't reach this at all" rather than "core must be first
    # to connect." Not a full fix (any process running as this same user
    # could already control the cursor directly via pynput, bypassing this
    # socket entirely), but it closes the specific "another local user, or
    # a sandboxed/restricted process, connects here" path for free.
    os.chmod(socket_path, 0o600)
    sock.listen(1)
    return sock


def accept_one(server: socket.socket) -> socket.socket:
    """Block for exactly one client connection."""
    conn, _ = server.accept()
    return conn


def connect(socket_path: Path) -> socket.socket:
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(str(socket_path))
    return sock


def send_line(conn: socket.socket, message: dict[str, Any]) -> None:
    conn.sendall((json.dumps(message) + "\n").encode("utf-8"))


# Generous but finite -- the largest real message on this transport is a
# base64 gesture preview image (~19KB measured, GESTURE_PREVIEW_WIDTH).
# Security review, 2026-08-13: an unbounded buffer is a memory-exhaustion
# DoS against a long-lived daemon if a connected peer never sends '\n'.
MAX_LINE_BYTES = 10 * 1024 * 1024


def read_lines(conn: socket.socket) -> Iterator[dict[str, Any]]:
    """Yield parsed JSON objects, one per newline-terminated line, until the
    peer closes the connection (or sends a line over MAX_LINE_BYTES, which
    closes the connection from this side instead of buffering forever)."""
    buf = b""
    while True:
        chunk = conn.recv(4096)
        if not chunk:
            return
        buf += chunk
        if len(buf) > MAX_LINE_BYTES:
            return
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            if line.strip():
                yield json.loads(line)
