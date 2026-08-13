"""senses/eyes/pointer.py — hand-driven real macOS cursor control.

Two-part safety model, deliberately mirroring the pattern CLAUDE.md § 5
already establishes for red-tier actions ("voice composes, a real
keystroke or click still fires it"): the hand only ever *moves* the
cursor -- visible, harmless, undone by moving the hand again, exactly
the same risk profile `APP_CONTROL` was accepted at. A real *click* only
ever fires on a real, physical keypress at that instant. No hand
gesture, no voice command, and no model output can fire a click by
itself -- `ClickTrigger` reads real OS keyboard state, nothing else.

This is why `POINTER_CONTROL` is a green-tier capability rather than
routed through the approval queue: the physical key *is* the approval,
the same way a real keystroke is what fires a drafted red-tier send.
Gating every individual click through the yellow-tier queue would be
absurd for something as routine as a mouse click, and would defeat the
whole point of hands-free pointing.

**Real gap found by a security review, 2026-08-13, fixed here:** the
original default trigger key was Space -- the single most overloaded
key on a keyboard (types a character, pauses media, activates a
focused button in most UI toolkits). The physical key proved *a
keypress happened*, not that the owner *intended a click there*: an
ordinary Space press for an unrelated reason, while pointer control
happened to be on and a hand happened to be visible, fired a real,
extra click wherever the hand last mapped to on screen -- reproducing
exactly the harm this design exists to prevent (ADR-056). Two
independent fixes, not one:
1. Default trigger changed to a bare modifier key (`ctrl_r`, right
   Control) -- pressed and released alone, with no other key, it types
   nothing and has no bound meaning in virtually any macOS app or
   system shortcut, unlike Space.
2. A click's edge no longer counts unless the hand is *also* in a
   deliberate pointing pose (`is_pointing`, index extended, other
   fingers curled) at that instant -- not just any visible hand, so an
   incidental hand near the camera can't arm a click on its own either.
"""

from __future__ import annotations

from typing import Protocol

from senses.eyes import config


class PointerBackend(Protocol):
    def screen_size(self) -> tuple[float, float]:
        """Real screen width/height in points, for mapping a normalized
        landmark position to an actual cursor coordinate."""
        ...

    def move_to(self, x: float, y: float) -> None: ...

    def click(self) -> None: ...


class RealPointerBackend:
    """`pynput` + `Quartz` -- both already project dependencies (`pynput`
    for `senses/ears`'s push-to-talk hotkey; `Quartz` is `pynput`'s own
    macOS backend, confirmed already installed, not a new dependency).
    Verified real before adoption: real cursor move + read-back + Quartz
    screen-size read against this actual machine (1440x900)."""

    def __init__(self) -> None:
        import Quartz
        from pynput.mouse import Button, Controller

        self._quartz = Quartz
        self._mouse = Controller()
        self._button = Button.left

    def screen_size(self) -> tuple[float, float]:
        bounds = self._quartz.CGDisplayBounds(self._quartz.CGMainDisplayID())
        return (bounds.size.width, bounds.size.height)

    def move_to(self, x: float, y: float) -> None:
        self._mouse.position = (x, y)

    def click(self) -> None:
        self._mouse.click(self._button)


class ClickTrigger(Protocol):
    """Real, physical key state. Nothing in this module ever calls
    `click()` from anywhere except a `True` read from here -- see the
    module docstring."""

    def is_pressed(self) -> bool: ...

    def close(self) -> None: ...


class PynputClickTrigger:
    """Same shape as `senses/ears/hotkey.py`'s `PynputHotkey`: a
    `keyboard.Listener` on its own thread, tracking press/release state.
    Unlike that one, this only needs the current level (is it down right
    now), not a blocking wait -- the gesture loop polls it once per
    frame."""

    def __init__(self, key: object | None = None) -> None:
        from pynput import keyboard

        # `config.py` stores only the *name* ("space"), not a `keyboard.Key`
        # -- config is imported eagerly by modules with no reason to pay
        # pynput's import cost, so the actual Key object is resolved here,
        # lazily, alongside pynput itself.
        self._key = key or getattr(keyboard.Key, config.POINTER_CLICK_KEY_NAME)
        self._pressed = False
        self._listener = keyboard.Listener(on_press=self._on_press, on_release=self._on_release)
        self._listener.start()

    def _on_press(self, key: object) -> None:
        if key == self._key:
            self._pressed = True

    def _on_release(self, key: object) -> None:
        if key == self._key:
            self._pressed = False

    def is_pressed(self) -> bool:
        return self._pressed

    def close(self) -> None:
        self._listener.stop()


def map_to_screen(x: float, y: float, screen_w: float, screen_h: float) -> tuple[float, float]:
    """Normalized (0..1, already-mirrored landmark space) -> real screen
    pixels. Pure and direct -- no dead zone or region clamping yet;
    whether the full camera frame maps comfortably to the full screen or
    needs a smaller "active region" for precision is a real UX question
    that needs the owner's own hand at a real distance from the camera
    to answer, not something to guess at here.

    Not reachable today -- landmarks come only from the local on-device
    MediaPipe model, never wire-deserialized -- but `min`/`max` with a
    NaN operand is not well-defined in Python, so a degenerate hand pose
    or a future `HandTracker` implementation is cheap to harden against
    now (security review, 2026-08-13)."""
    import math

    if not (math.isfinite(x) and math.isfinite(y)):
        return (screen_w / 2, screen_h / 2)
    return (
        max(0.0, min(screen_w, x * screen_w)),
        max(0.0, min(screen_h, y * screen_h)),
    )
