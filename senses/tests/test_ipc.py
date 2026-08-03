"""In-process socketpair only — no filesystem socket, no network."""

from __future__ import annotations

import socket

from senses.ipc import read_lines, send_line


def test_send_and_read_round_trip() -> None:
    a, b = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        send_line(a, {"type": "utterance", "text": "hello", "ts": 123.0})
        send_line(a, {"type": "utterance", "text": "world", "ts": 124.0})
        a.close()  # signals EOF so read_lines() knows to stop

        messages = list(read_lines(b))
    finally:
        b.close()

    assert messages == [
        {"type": "utterance", "text": "hello", "ts": 123.0},
        {"type": "utterance", "text": "world", "ts": 124.0},
    ]
