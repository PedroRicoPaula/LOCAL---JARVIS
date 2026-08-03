"""senses/ears/hotkey.py — hold-to-talk. Push-to-talk means what it says."""

from __future__ import annotations

import threading
from typing import Protocol

from pynput import keyboard

from senses.ears.config import HOTKEY


class Hotkey(Protocol):
    def wait_for_press(self) -> None:
        """Block until the hotkey goes down."""
        ...

    def wait_for_release(self) -> None:
        """Block until the hotkey comes back up."""
        ...


class PynputHotkey:
    """Requires macOS Accessibility permission for the process that runs
    this (System Settings -> Privacy & Security -> Accessibility). pynput
    can't request that itself — the OS shows its own dialog the first time,
    or nothing fires silently if it was previously denied."""

    def __init__(self, key: keyboard.Key | keyboard.KeyCode = HOTKEY) -> None:
        self._key = key
        self._pressed = False
        self._press_event = threading.Event()
        self._release_event = threading.Event()
        self._listener = keyboard.Listener(on_press=self._on_press, on_release=self._on_release)
        self._listener.start()

    def _on_press(self, key: keyboard.Key | keyboard.KeyCode | None) -> None:
        if key == self._key and not self._pressed:
            self._pressed = True
            self._release_event.clear()
            self._press_event.set()

    def _on_release(self, key: keyboard.Key | keyboard.KeyCode | None) -> None:
        if key == self._key:
            self._pressed = False
            self._press_event.clear()
            self._release_event.set()

    def wait_for_press(self) -> None:
        self._press_event.wait()
        self._press_event.clear()

    def wait_for_release(self) -> None:
        self._release_event.wait()
        self._release_event.clear()

    def stop(self) -> None:
        self._listener.stop()
