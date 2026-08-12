"""Fakes only — no camera, no mediapipe, no real elapsed time.
CLAUDE.md § 3."""

from __future__ import annotations

from typing import Any

from senses.eyes.fakes import FakeBackgroundBlurrer, FakeHandTracker, fake_clock
from senses.eyes.gestures import GestureLoop, Hand, Landmark, hands_to_wire, mirror_hands


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
    without a real thread or real time passing."""
    reads = [0]

    def read_raw_frame() -> object:
        reads[0] += 1
        return f"frame-{reads[0]}"

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
