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


# --- malformed input must never kill a daemon (2026-08-17) -----------
# Reproduced against the real reader before fixing: `json.loads` was
# unguarded, and the exception surfaced from the generator's own
# `next()` -- outside every try/except in both callers. One bad byte on
# the socket killed TTS or the whole camera subsystem.


def _pump(payloads: list[bytes]) -> list[dict]:
    """Feeds raw bytes through a real socket pair into read_lines."""
    a, b = socket.socketpair()
    for p in payloads:
        b.sendall(p)
    b.close()
    try:
        return list(read_lines(a))
    finally:
        a.close()


def test_a_malformed_line_is_skipped_and_the_next_valid_one_still_arrives():
    got = _pump([b'{"type":"ok"}\n', b"this is not json\n", b'{"type":"after"}\n'])
    assert got == [{"type": "ok"}, {"type": "after"}]


def test_invalid_utf8_is_skipped_rather_than_crashing_the_daemon():
    got = _pump([b'{"type":"before"}\n', b"\x80\x81\xfe\n", b'{"type":"after"}\n'])
    assert got == [{"type": "before"}, {"type": "after"}]


def test_several_malformed_lines_in_a_row_do_not_stop_the_stream():
    got = _pump([b"{\n", b"]\n", b"nope\n", b"\n", b'{"type":"survivor"}\n'])
    assert got == [{"type": "survivor"}]


def test_valid_json_that_is_not_an_object_is_still_yielded_not_crashed_on():
    # A bare scalar/array is valid JSON. The handlers ignore unknown
    # shapes; the reader's job is only not to die.
    got = _pump([b"123\n", b'"text"\n', b"[1,2]\n", b'{"type":"ok"}\n'])
    assert got[-1] == {"type": "ok"}
