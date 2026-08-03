"""senses/voice/main.py — streaming TTS. Runs as a long-lived server:
listens on a Unix socket, accepts whoever connects (the Phase 1 echo bridge
today, core/ from Phase 3 on), and speaks each {"type": "speak", ...}
message sentence by sentence. No executor imports here, by construction —
see docs/ARCHITECTURE.md § 7.
"""

from __future__ import annotations

import contextlib
import socket

from senses import ipc
from senses.voice import config
from senses.voice.say_backend import MacSayBackend, SayBackend
from senses.voice.sentences import split_sentences


def speak_text(text: str, backend: SayBackend) -> None:
    """Splits on sentence boundaries so the backend starts on the first
    complete sentence rather than waiting for the whole text — CLAUDE.md
    § 7's streaming rule, applied even though Phase 1's source (the echo
    handler) hands over the full text at once."""
    for sentence in split_sentences(text):
        backend.speak(sentence)


def run_forever(backend: SayBackend, conn: socket.socket) -> None:
    for message in ipc.read_lines(conn):
        if message.get("type") != "speak":
            continue
        try:
            speak_text(message.get("text", ""), backend)
        except (BrokenPipeError, ConnectionResetError):
            raise
        except Exception as exc:  # broad on purpose — supervisor boundary.
            # `voice` is "launchd, idle" per SPEC.md § 2 but still expected
            # to keep running; one bad `say` call (subprocess hiccup, an
            # unsupported character) shouldn't end the process.
            print(f"voice: failed to speak {message.get('text', '')!r}, continuing ({exc!r})")


def main() -> None:
    backend = MacSayBackend()
    server = ipc.listen(config.SOCKET_PATH)
    print(f"voice: listening on {config.SOCKET_PATH}")

    while True:
        conn = ipc.accept_one(server)
        print("voice: bridge/core connected")
        with contextlib.suppress(BrokenPipeError, ConnectionResetError):
            run_forever(backend, conn)
        print("voice: bridge/core disconnected, waiting for reconnect")


if __name__ == "__main__":
    main()
