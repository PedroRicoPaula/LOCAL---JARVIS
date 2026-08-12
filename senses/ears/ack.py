"""senses/ears/ack.py — reflex-lane acknowledgement on wake.

SPEC.md § 3: reflex budget is <300ms. A system sound is faster than
spawning `say` for a spoken reply and feels more "instant" — a played
sound doesn't need synthesis. No new dependency: both `afplay` and
`osascript` ship with macOS.
"""

from __future__ import annotations

import subprocess
from typing import Protocol

from senses.ears.config import (
    ACK_NO_SPEECH_NOTIFICATION_TEXT,
    ACK_NO_SPEECH_SOUND,
    ACK_NOTIFICATION_TEXT,
    ACK_SOUND,
)


class Ack(Protocol):
    def fire(self) -> None:
        """Audible + visible acknowledgement that the wake word landed.
        Must return quickly — callers don't wait for the sound to finish
        playing."""
        ...

    def fire_no_speech(self) -> None:
        """A distinct, honest signal for 'heard the wake word, but caught
        no usable speech after it' — without this, that case is silent
        and indistinguishable from a hang. See config.py's own comment
        on ACK_NO_SPEECH_SOUND for the real incident that found this."""
        ...


def _play_and_notify(sound: str, text: str) -> None:
    # Both spawned, not awaited: the reflex budget is for triggering
    # the ack, not for the sound finishing playback.
    subprocess.Popen(
        ["afplay", sound],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    notification_script = f'display notification "{text}" with title "JARVIS"'
    subprocess.Popen(
        ["osascript", "-e", notification_script],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


class SystemAck:
    def fire(self) -> None:
        _play_and_notify(ACK_SOUND, ACK_NOTIFICATION_TEXT)

    def fire_no_speech(self) -> None:
        _play_and_notify(ACK_NO_SPEECH_SOUND, ACK_NO_SPEECH_NOTIFICATION_TEXT)
