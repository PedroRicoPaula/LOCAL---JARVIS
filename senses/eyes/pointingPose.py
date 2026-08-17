"""senses/eyes/pointingPose.py — the "is this hand deliberately pointing"
pose check that gates a pointer-control click. Split out of `gestures.py`
2026-08-17 (CLAUDE.md § 3's ~300-line guideline) -- self-contained
landmark-geometry logic, independent of `GestureLoop`'s own orchestration.
"""

from __future__ import annotations

from senses.eyes.handTracker import Hand, Landmark

# MediaPipe's fixed 21-point topology (same indices `ui/src/lib/hand.ts`
# uses browser-side for the pinch/open-palm demos).
_WRIST = 0
_INDEX_TIP, _INDEX_JOINT = 8, 6
_MIDDLE_TIP, _MIDDLE_JOINT = 12, 10
_RING_TIP, _RING_JOINT = 16, 14
_PINKY_TIP, _PINKY_JOINT = 20, 18


def _distance(a: Landmark, b: Landmark) -> float:
    return ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) ** 0.5


def is_pointing(hand: Hand) -> bool:
    """Index finger extended, the other three curled -- the deliberate
    "I am pointing at something" pose. Added 2026-08-13 after a security
    review found that requiring *only* a physical keypress to fire a
    click was not enough on its own: an incidental hand near the camera
    (plausible on a laptop, whose built-in camera commonly sees hands
    near the keyboard) could arm a click on a coincidental keypress
    unrelated to pointing. This closes that gap independently of the
    keypress fix -- a click now needs *both* a real key edge *and* a
    real pointing hand at that instant, not either alone."""
    lm = hand.landmarks
    if len(lm) <= max(_PINKY_TIP, _PINKY_JOINT):
        return False
    wrist = lm[_WRIST]

    def extended(tip: int, joint: int) -> bool:
        return _distance(wrist, lm[tip]) > _distance(wrist, lm[joint])

    return (
        extended(_INDEX_TIP, _INDEX_JOINT)
        and not extended(_MIDDLE_TIP, _MIDDLE_JOINT)
        and not extended(_RING_TIP, _RING_JOINT)
        and not extended(_PINKY_TIP, _PINKY_JOINT)
    )
