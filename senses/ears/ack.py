"""senses/ears/ack.py — reflex-lane acknowledgement on wake.

SPEC.md § 3: reflex budget is <300ms. A system sound is faster than
spawning `say` for a spoken reply and feels more "instant" — a played
sound doesn't need synthesis. No new dependency: both `afplay` and
`osascript` ship with macOS.
"""

from __future__ import annotations

import subprocess
from typing import Protocol

from senses.ears.config import ACK_NOTIFICATION_TEXT, ACK_SOUND


class Ack(Protocol):
    def fire(self) -> None:
        """Audible + visible acknowledgement. Must return quickly — callers
        don't wait for the sound to finish playing."""
        ...


class SystemAck:
    def fire(self) -> None:
        # Both spawned, not awaited: the reflex budget is for triggering
        # the ack, not for the sound finishing playback.
        subprocess.Popen(
            ["afplay", ACK_SOUND],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        notification_script = f'display notification "{ACK_NOTIFICATION_TEXT}" with title "JARVIS"'
        subprocess.Popen(
            ["osascript", "-e", notification_script],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
