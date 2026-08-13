"""Fakes only — no camera, no mediapipe, no real elapsed time.
CLAUDE.md § 3."""

from __future__ import annotations

from typing import Any

import numpy as np

from senses.eyes.fakes import (
    FakeBackgroundBlurrer,
    FakeClickTrigger,
    FakeHandTracker,
    FakePointerBackend,
    fake_clock,
)
from senses.eyes.gestures import (
    GestureLoop,
    Hand,
    Landmark,
    hands_to_wire,
    is_pointing,
    mirror_hands,
    resize_for_preview,
)


def _hand(x: float = 0.3, handedness: str = "Right") -> Hand:
    return Hand(handedness=handedness, landmarks=tuple(Landmark(x, 0.5, 0.0) for _ in range(21)))


def _loop(
    tracker: FakeHandTracker,
    emitted: list[dict[str, Any]],
    *,
    now_box: list[float] | None = None,
    now: Any = None,
    stop_after: int | None = None,
    mirror: Any = None,
    **kwargs: Any,
) -> GestureLoop:
    """Builds a loop whose collaborators are all fake. `stop_after`
    auto-stops the loop after N frames so `run()` terminates in a test
    without a real thread or real time passing.

    `pointer_backend_factory`/`click_trigger_factory` default to fakes
    here (not left to each call site) after a real crash: a test that
    called `set_pointer_control(True)` without overriding
    `click_trigger_factory` fell through to `GestureLoop`'s own default
    (`PynputClickTrigger`), which starts a *real* macOS-wide keyboard
    listener thread -- several of those piling up across a test run
    segfaulted the interpreter. Defaulting here means forgetting is no
    longer possible; a test that wants to inspect a specific fake still
    overrides these via `**kwargs` exactly as before."""
    reads = [0]

    def read_raw_frame() -> object:
        reads[0] += 1
        return f"frame-{reads[0]}"

    kwargs.setdefault("pointer_backend_factory", FakePointerBackend)
    kwargs.setdefault("click_trigger_factory", FakeClickTrigger)
    # Identity by default, same reasoning as mirror below -- resizing a
    # real frame is cv2's job, and the fake frames here are opaque
    # string markers with no .shape to resize.
    kwargs.setdefault("resize", lambda f, _width: f)

    loop = GestureLoop(
        read_raw_frame,
        tracker,
        emitted.append,
        now=now or (lambda: 0.0),
        sleep=lambda _: None,
        encode=lambda _f: "fake-base64",
        mirror=mirror or (lambda f: f),  # mirroring is cv2's job; identity by default
        **kwargs,
    )
    if stop_after is not None:
        original = loop._emit  # noqa: SLF001 -- deliberately wrapping the injected emit

        def counting_emit(msg: dict[str, Any]) -> None:
            original(msg)
            if sum(1 for m in emitted if m["type"] == "hand.landmarks") >= stop_after:
                loop.stop()

        loop._emit = counting_emit  # noqa: SLF001
    return loop


def test_emits_landmarks_every_frame() -> None:
    tracker = FakeHandTracker([(_hand(),)])
    emitted: list[dict[str, Any]] = []

    _loop(tracker, emitted, stop_after=3).run()

    landmark_msgs = [m for m in emitted if m["type"] == "hand.landmarks"]
    assert len(landmark_msgs) == 3
    assert len(landmark_msgs[0]["hands"]) == 1
    assert len(landmark_msgs[0]["hands"][0]["landmarks"]) == 21


def test_no_hand_visible_still_emits_an_empty_frame_not_silence() -> None:
    """An empty hands list is real information (the hand left the frame),
    not nothing to say -- the dashboard needs it to clear its overlay."""
    tracker = FakeHandTracker([()])
    emitted: list[dict[str, Any]] = []

    _loop(tracker, emitted, stop_after=2).run()

    landmark_msgs = [m for m in emitted if m["type"] == "hand.landmarks"]
    assert len(landmark_msgs) == 2
    assert landmark_msgs[0]["hands"] == []


def test_preview_is_rate_limited_below_the_landmark_rate() -> None:
    """Landmarks are tiny and go out every frame; base64 preview images
    are the expensive part and must not."""
    tracker = FakeHandTracker([(_hand(),)])
    emitted: list[dict[str, Any]] = []
    box, now = fake_clock(start=0.0)

    def advancing_now() -> float:
        box[0] += 1 / 12  # one frame at 12fps
        return box[0]

    _loop(tracker, emitted, now=advancing_now, stop_after=12, fps=12, preview_fps=4).run()

    landmarks = [m for m in emitted if m["type"] == "hand.landmarks"]
    previews = [m for m in emitted if m["type"] == "hand.preview"]
    assert len(landmarks) == 12
    assert 0 < len(previews) < len(landmarks)


def test_preview_is_skipped_entirely_while_pointer_control_is_on() -> None:
    """Owner request 2026-08-12: using the real cursor means looking at
    the real screen, not the dashboard's camera panel -- encoding and
    sending a preview nobody's watching is pure waste. Landmarks (what
    pointer control itself runs on) must still go out every frame."""
    tracker = FakeHandTracker([(_hand_at(0.5, 0.5),)])
    emitted: list[dict[str, Any]] = []
    box, advancing_now = fake_clock(start=0.0)

    def advance() -> float:
        box[0] += 1 / 12
        return box[0]

    loop = _loop(tracker, emitted, now=advance, stop_after=12, fps=12, preview_fps=4)
    loop.set_pointer_control(True)

    loop.run()

    landmarks = [m for m in emitted if m["type"] == "hand.landmarks"]
    previews = [m for m in emitted if m["type"] == "hand.preview"]
    assert len(landmarks) == 12, "pointer control itself must keep running every frame"
    assert previews == [], "no preview should be generated while pointer control is active"


def test_idle_timeout_stops_the_loop_when_no_hand_is_ever_seen() -> None:
    tracker = FakeHandTracker([()])  # never any hands
    emitted: list[dict[str, Any]] = []
    box, _ = fake_clock(start=0.0)

    def advancing_now() -> float:
        box[0] += 10.0  # 10 simulated seconds per frame
        return box[0]

    _loop(tracker, emitted, now=advancing_now, idle_timeout_s=30).run()

    stopped = [m for m in emitted if m["type"] == "gesture.stopped"]
    assert stopped and stopped[-1]["cause"] == "idle"


def test_a_visible_hand_keeps_the_loop_alive_past_the_idle_timeout() -> None:
    tracker = FakeHandTracker([(_hand(),)])
    emitted: list[dict[str, Any]] = []
    box, _ = fake_clock(start=0.0)

    def advancing_now() -> float:
        box[0] += 10.0
        return box[0]

    _loop(tracker, emitted, now=advancing_now, idle_timeout_s=30, stop_after=8).run()

    stopped = [m for m in emitted if m["type"] == "gesture.stopped"]
    assert stopped and stopped[-1]["cause"] == "owner"  # stopped by us, not timed out


def test_a_camera_read_failure_stops_honestly_instead_of_spinning() -> None:
    tracker = FakeHandTracker([(_hand(),)])
    emitted: list[dict[str, Any]] = []

    def failing_read() -> object:
        raise RuntimeError("camera went away")

    GestureLoop(
        failing_read,
        tracker,
        emitted.append,
        now=lambda: 0.0,
        sleep=lambda _: None,
        encode=lambda _f: "x",
        mirror=lambda f: f,
    ).run()

    assert any(m["type"] == "error" and "camera went away" in m["message"] for m in emitted)
    stopped = [m for m in emitted if m["type"] == "gesture.stopped"]
    assert stopped and stopped[-1]["cause"] == "error"


def test_stop_ends_the_loop_and_reports_owner_cause() -> None:
    tracker = FakeHandTracker([(_hand(),)])
    emitted: list[dict[str, Any]] = []
    loop = _loop(tracker, emitted, stop_after=1)

    loop.run()

    assert loop.stopped
    assert emitted[-1] == {"type": "gesture.stopped", "cause": "owner"}


def test_resize_for_preview_downscales_a_larger_frame() -> None:
    frame = np.zeros((960, 640, 3), dtype=np.uint8)

    resized = resize_for_preview(frame, 480)

    assert resized.shape == (720, 480, 3), "height must scale proportionally with width"


def test_resize_for_preview_is_a_no_op_when_already_narrow_enough() -> None:
    """Regression guard for the real fix, 2026-08-12: blur used to run on
    the full 960x640 capture and only get downscaled *after*, nearly
    doubling the loop's own CPU cost for resolution nothing ever
    displayed. `_run()` must resize before blur, not the other way
    round -- this just confirms the function itself never *upscales* a
    frame that's already small enough, so calling it twice (once before
    blur, once inside encode_preview) stays cheap either way."""
    frame = np.zeros((300, 400, 3), dtype=np.uint8)

    resized = resize_for_preview(frame, 480)

    assert resized.shape == frame.shape


def test_blur_off_by_default_the_segmenter_is_never_built() -> None:
    """Leaving blur off must cost nothing -- the factory itself proves a
    segmenter would only ever be constructed on demand."""
    tracker = FakeHandTracker([(_hand(),)])
    emitted: list[dict[str, Any]] = []
    built = []

    def factory() -> FakeBackgroundBlurrer:
        built.append(1)
        return FakeBackgroundBlurrer()

    _loop(tracker, emitted, stop_after=3, blurrer_factory=factory).run()

    assert built == []


def test_blur_enabled_applies_to_the_preview_frame_only() -> None:
    """Landmark detection must see the real, unblurred frame -- only the
    preview that reaches the dashboard should be touched."""
    tracker = FakeHandTracker([(_hand(),)])
    emitted: list[dict[str, Any]] = []
    blurrer = FakeBackgroundBlurrer()

    box, advancing_now = fake_clock(start=0.0)
    box[0] = 1.0  # past the (tiny) preview interval on frame 1

    loop = _loop(
        tracker,
        emitted,
        stop_after=1,
        blurrer_factory=lambda: blurrer,
        preview_fps=1000,
        fps=1000,
        now=advancing_now,
    )
    loop.set_blur(True)
    assert loop.blur_enabled
    loop.run()

    assert blurrer.blurred_frames, "blur should have been applied to at least one preview frame"
    assert tracker.seen_frames == ["frame-1"], "detection must still see the raw frame"
    previews = [m for m in emitted if m["type"] == "hand.preview"]
    assert previews and previews[0]["image"] == "fake-base64"


def test_blur_can_be_turned_back_off() -> None:
    loop = _loop(FakeHandTracker(), [], blurrer_factory=FakeBackgroundBlurrer)
    loop.set_blur(True)
    assert loop.blur_enabled
    loop.set_blur(False)
    assert not loop.blur_enabled


def test_blurrer_is_closed_when_the_loop_exits() -> None:
    tracker = FakeHandTracker([(_hand(),)])
    emitted: list[dict[str, Any]] = []
    blurrer = FakeBackgroundBlurrer()
    box, advancing_now = fake_clock(start=0.0)
    box[0] = 1.0

    loop = _loop(
        tracker,
        emitted,
        stop_after=1,
        blurrer_factory=lambda: blurrer,
        preview_fps=1000,
        fps=1000,
        now=advancing_now,
    )
    loop.set_blur(True)
    loop.run()

    assert blurrer.closed


def test_a_failing_blur_is_cosmetic_tracking_keeps_going() -> None:
    tracker = FakeHandTracker([(_hand(),)])
    emitted: list[dict[str, Any]] = []

    class BrokenBlurrer:
        def blur(self, frame: object) -> object:
            raise RuntimeError("segmenter exploded")

        def close(self) -> None:
            pass

    box, advancing_now = fake_clock(start=0.0)
    box[0] = 1.0

    loop = _loop(
        tracker,
        emitted,
        stop_after=2,
        blurrer_factory=BrokenBlurrer,
        preview_fps=1000,
        fps=1000,
        now=advancing_now,
    )
    loop.set_blur(True)
    loop.run()

    landmark_msgs = [m for m in emitted if m["type"] == "hand.landmarks"]
    assert len(landmark_msgs) == 2, "a broken blurrer must not stop landmark tracking"


def _hand_at(x: float, y: float) -> Hand:
    """21 landmarks, all at the same point except index 8 (fingertip) --
    only the fingertip position drives the cursor, so tests only need to
    control that one. Deliberately NOT a pointing pose (every joint sits
    on top of the wrist, so nothing reads as "extended") -- use
    `_pointing_hand_at` for anything that needs a click to actually
    fire, now that clicks also require `is_pointing`."""
    landmarks = [Landmark(0.5, 0.5, 0.0)] * 21
    landmarks[8] = Landmark(x, y, 0.0)
    return Hand(handedness="Right", landmarks=tuple(landmarks))


def _pointing_hand_at(x: float, y: float) -> Hand:
    """A real pointing pose: wrist at the frame centre, index tip clearly
    extended toward (x, y), the other three fingertips clearly curled
    back near the wrist -- the shape `is_pointing` looks for."""
    wrist = (0.5, 0.5)
    landmarks = [Landmark(wrist[0], wrist[1], 0.0)] * 21
    landmarks = list(landmarks)
    landmarks[0] = Landmark(wrist[0], wrist[1], 0.0)  # WRIST
    landmarks[6] = Landmark(wrist[0], wrist[1], 0.0)  # index joint: at wrist
    landmarks[8] = Landmark(x, y, 0.0)  # index tip: far from wrist -> extended
    # Other three fingers' tips sit ON their own joints (curled, not
    # extended) -- both landmarks of each pair identical is unambiguous.
    for tip, joint in ((12, 10), (16, 14), (20, 18)):
        landmarks[tip] = Landmark(wrist[0] + 0.01, wrist[1], 0.0)
        landmarks[joint] = Landmark(wrist[0] + 0.01, wrist[1], 0.0)
    return Hand(handedness="Right", landmarks=tuple(landmarks))


def test_pointer_control_off_by_default_the_cursor_never_moves() -> None:
    tracker = FakeHandTracker([(_hand_at(0.5, 0.5),)])
    backend = FakePointerBackend()
    emitted: list[dict[str, Any]] = []

    _loop(tracker, emitted, stop_after=3, pointer_backend_factory=lambda: backend).run()

    assert backend.moves == []


def test_pointer_control_moves_the_real_cursor_to_the_mapped_fingertip() -> None:
    tracker = FakeHandTracker([(_hand_at(0.5, 0.5),)])
    backend = FakePointerBackend(screen_w=1440.0, screen_h=900.0)
    trigger = FakeClickTrigger()
    emitted: list[dict[str, Any]] = []

    loop = _loop(
        tracker,
        emitted,
        stop_after=1,
        pointer_backend_factory=lambda: backend,
        click_trigger_factory=lambda: trigger,
    )
    loop.set_pointer_control(True)
    assert loop.pointer_control_enabled
    loop.run()

    assert backend.moves == [(720.0, 450.0)]


def test_pointer_control_never_moves_the_cursor_when_no_hand_is_visible() -> None:
    tracker = FakeHandTracker([()])  # no hands this frame
    backend = FakePointerBackend()
    emitted: list[dict[str, Any]] = []

    loop = _loop(tracker, emitted, stop_after=1, pointer_backend_factory=lambda: backend)
    loop.set_pointer_control(True)
    loop.run()

    assert backend.moves == []


def test_click_fires_once_on_key_down_not_repeatedly_while_held() -> None:
    """The real, physical safety property this whole feature rests on:
    a click only fires on the down-edge of a real keypress, never a
    gesture, never a spoken word, and never once per frame while a key
    happens to still be held."""
    tracker = FakeHandTracker([(_pointing_hand_at(0.8, 0.3),)])
    backend = FakePointerBackend()
    trigger = FakeClickTrigger()
    emitted: list[dict[str, Any]] = []

    loop = _loop(
        tracker,
        emitted,
        stop_after=4,
        pointer_backend_factory=lambda: backend,
        click_trigger_factory=lambda: trigger,
    )
    loop.set_pointer_control(True)
    trigger.pressed = True  # held down for every one of the 4 frames

    loop.run()

    assert backend.click_count == 1, "one held key-press must fire exactly one click, not four"


def test_click_never_fires_from_a_gesture_alone_no_trigger_configured() -> None:
    """Even a hand that looks like it's "clicking" (e.g. a pinch) must
    never itself fire a real click -- only `ClickTrigger.is_pressed()`
    (a real physical key) can. This test simulates "gesture wants to
    click" by simply never pressing the real key at all."""
    tracker = FakeHandTracker([(_hand_at(0.5, 0.5),)])
    backend = FakePointerBackend()
    trigger = FakeClickTrigger()
    emitted: list[dict[str, Any]] = []

    loop = _loop(
        tracker,
        emitted,
        stop_after=5,
        pointer_backend_factory=lambda: backend,
        click_trigger_factory=lambda: trigger,
    )
    loop.set_pointer_control(True)
    # trigger.pressed deliberately left False throughout.

    loop.run()

    assert backend.click_count == 0


def test_pressing_and_releasing_twice_fires_two_clicks() -> None:
    tracker = FakeHandTracker([(_pointing_hand_at(0.8, 0.3),)])
    backend = FakePointerBackend()
    trigger = FakeClickTrigger()
    emitted: list[dict[str, Any]] = []
    presses = iter([True, False, True, False])

    def read_raw_frame_and_toggle() -> object:
        trigger.pressed = next(presses, False)
        return "frame"

    loop = _loop(
        tracker,
        emitted,
        stop_after=4,
        pointer_backend_factory=lambda: backend,
        click_trigger_factory=lambda: trigger,
    )
    loop._read_raw_frame = read_raw_frame_and_toggle  # noqa: SLF001 -- deliberately overriding the fixture's own stub
    loop.set_pointer_control(True)

    loop.run()

    assert backend.click_count == 2


def test_click_does_not_fire_on_a_real_key_edge_without_a_pointing_pose() -> None:
    """Security review, 2026-08-13: a real key edge alone used to be
    enough. A hand that's visible but not in a deliberate pointing pose
    (e.g. resting near the keyboard while the owner types) must not let
    an unrelated key edge fire a click."""
    tracker = FakeHandTracker([(_hand_at(0.5, 0.5),)])  # visible, not pointing
    backend = FakePointerBackend()
    trigger = FakeClickTrigger()
    emitted: list[dict[str, Any]] = []

    loop = _loop(
        tracker,
        emitted,
        stop_after=1,
        pointer_backend_factory=lambda: backend,
        click_trigger_factory=lambda: trigger,
    )
    loop.set_pointer_control(True)
    trigger.pressed = True

    loop.run()

    assert backend.click_count == 0


def test_is_pointing_true_for_index_extended_others_curled() -> None:
    assert is_pointing(_pointing_hand_at(0.8, 0.2)) is True


def test_is_pointing_false_for_an_open_palm() -> None:
    wrist = (0.5, 0.5)
    landmarks = [Landmark(wrist[0], wrist[1], 0.0)] * 21
    landmarks = list(landmarks)
    # All four fingertips extended -- an open palm, not a point.
    for tip in (8, 12, 16, 20):
        landmarks[tip] = Landmark(wrist[0], wrist[1] - 0.3, 0.0)
    hand = Hand(handedness="Right", landmarks=tuple(landmarks))
    assert is_pointing(hand) is False


def test_is_pointing_false_for_a_closed_fist() -> None:
    hand = _hand_at(0.5, 0.5)  # index tip at the wrist too -- nothing extended
    assert is_pointing(hand) is False


def test_is_pointing_degrades_honestly_on_missing_landmarks() -> None:
    assert is_pointing(Hand(handedness="Right", landmarks=())) is False


def test_pointer_control_can_be_turned_back_off() -> None:
    loop = _loop(FakeHandTracker(), [], pointer_backend_factory=FakePointerBackend)
    loop.set_pointer_control(True)
    assert loop.pointer_control_enabled
    loop.set_pointer_control(False)
    assert not loop.pointer_control_enabled


def test_disabling_pointer_control_closes_the_real_keyboard_listener() -> None:
    """The click trigger is a system-wide keyboard listener -- it must
    not keep running (silently watching every keypress) once the owner
    turns pointer control off."""
    trigger = FakeClickTrigger()
    loop = _loop(
        FakeHandTracker(),
        [],
        pointer_backend_factory=FakePointerBackend,
        click_trigger_factory=lambda: trigger,
    )
    loop.set_pointer_control(True)
    assert not trigger.closed

    loop.set_pointer_control(False)

    assert trigger.closed


def test_click_trigger_is_closed_when_the_loop_exits_while_pointer_control_is_on() -> None:
    tracker = FakeHandTracker([(_hand_at(0.5, 0.5),)])
    backend = FakePointerBackend()
    trigger = FakeClickTrigger()
    emitted: list[dict[str, Any]] = []

    loop = _loop(
        tracker,
        emitted,
        stop_after=1,
        pointer_backend_factory=lambda: backend,
        click_trigger_factory=lambda: trigger,
    )
    loop.set_pointer_control(True)
    loop.run()

    assert trigger.closed


def test_a_failing_pointer_backend_is_cosmetic_tracking_keeps_going() -> None:
    tracker = FakeHandTracker([(_hand_at(0.5, 0.5),)])
    emitted: list[dict[str, Any]] = []

    class BrokenBackend:
        def screen_size(self) -> tuple[float, float]:
            raise RuntimeError("no display attached")

        def move_to(self, x: float, y: float) -> None:
            pass

        def click(self) -> None:
            pass

    loop = _loop(tracker, emitted, stop_after=3, pointer_backend_factory=BrokenBackend)
    loop.set_pointer_control(True)

    loop.run()

    landmark_msgs = [m for m in emitted if m["type"] == "hand.landmarks"]
    assert len(landmark_msgs) == 3, "a broken pointer backend must not stop landmark tracking"


def test_detection_runs_on_the_raw_frame_not_the_mirrored_one() -> None:
    """Regression, found live 2026-08-12 (owner: the skeleton was drawn
    on the opposite side of the real hand). The loop used to mirror the
    frame *before* handing it to the tracker, then mirror the resulting
    landmarks a second time -- two flips cancel out, so the landmarks
    ended up in unmirrored space while the preview image (and the
    dashboard's own skeleton overlay, drawn against that image) stayed
    mirrored. One flip must reach the tracker's input; a second,
    independent one must reach the emitted landmarks."""
    tracker = FakeHandTracker([(_hand(),)])
    emitted: list[dict[str, Any]] = []

    def flip_marker(f: object) -> str:
        return f"mirrored({f})"

    _loop(tracker, emitted, stop_after=1, mirror=flip_marker).run()

    assert tracker.seen_frames == ["frame-1"], (
        f"detect() must see the raw frame, not {tracker.seen_frames} -- "
        "mirroring it first double-flips the landmarks after mirror_hands()"
    )


def test_mirror_hands_flips_x_so_the_overlay_matches_the_mirrored_preview() -> None:
    hands = (_hand(x=0.25),)

    mirrored = mirror_hands(hands)

    assert mirrored[0].landmarks[0].x == 0.75
    assert mirrored[0].landmarks[0].y == 0.5  # y untouched
    assert mirrored[0].handedness == "Right"  # label preserved


def test_hands_to_wire_rounds_coordinates_and_keeps_handedness() -> None:
    hands = (Hand(handedness="Left", landmarks=(Landmark(0.123456, 0.9, -0.05),)),)

    wire = hands_to_wire(hands)

    assert wire == [{"handedness": "Left", "landmarks": [{"x": 0.1235, "y": 0.9, "z": -0.05}]}]
