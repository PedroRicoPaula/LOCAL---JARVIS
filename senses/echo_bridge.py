"""senses/echo_bridge.py — Phase 1 only.

Stands in for core/'s eventual position between ears and voice: reads an
utterance, speaks it back unchanged. This file is deliberately throwaway —
deleted wholesale in Phase 3 when real core/ (router, skills, gate) takes
this position. ears and voice don't change when that happens; they only
know "read from my socket" / "write to my socket," never that this bridge
exists.

Also where the Phase 1 latency number lives: DoD's "time to first audible
syllable" is `now - end_of_speech_ts` when handing the text to voice, printed
per utterance so the 10-trial measurement is just "run it 10 times, read the
log." This excludes `say`'s own process-spawn time (typically well under
50ms) — the gap between "handed to voice" and "sound actually starts" isn't
observable from here without a feedback channel we don't have in Phase 1.
"""

from __future__ import annotations

import socket
import time

from senses import ipc
from senses.ears.config import SOCKET_PATH as EARS_SOCKET
from senses.voice.config import SOCKET_PATH as VOICE_SOCKET

_RETRY_DELAY_S = 0.5
_RETRY_ATTEMPTS = 20  # ~10s total — enough for `make dev` to have started ears/voice


def connect_with_retry(socket_path) -> socket.socket:
    last_error: OSError | None = None
    for _ in range(_RETRY_ATTEMPTS):
        try:
            return ipc.connect(socket_path)
        except OSError as exc:
            last_error = exc
            time.sleep(_RETRY_DELAY_S)
    assert last_error is not None
    raise last_error


def main() -> None:
    print(f"echo_bridge: connecting to ears ({EARS_SOCKET})")
    ears_conn = connect_with_retry(EARS_SOCKET)
    print(f"echo_bridge: connecting to voice ({VOICE_SOCKET})")
    voice_conn = connect_with_retry(VOICE_SOCKET)
    print("echo_bridge: connected to both. Hold the hotkey and speak.")

    for message in ipc.read_lines(ears_conn):
        if message.get("type") != "utterance":
            continue
        text = message.get("text", "")
        end_of_speech_ts = message.get("ts", time.time())

        ipc.send_line(voice_conn, {"type": "speak", "text": text})

        handoff_latency_ms = (time.time() - end_of_speech_ts) * 1000
        print(
            f"echo_bridge: heard {text!r} — {handoff_latency_ms:.0f}ms "
            f"end-of-speech to handed-to-voice"
        )


if __name__ == "__main__":
    main()
