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


def read_lines(conn: socket.socket) -> Iterator[dict[str, Any]]:
    """Yield parsed JSON objects, one per newline-terminated line, until the
    peer closes the connection."""
    buf = b""
    while True:
        chunk = conn.recv(4096)
        if not chunk:
            return
        buf += chunk
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            if line.strip():
                yield json.loads(line)
