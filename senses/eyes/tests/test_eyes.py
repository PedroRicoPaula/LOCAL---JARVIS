"""Fakes only -- no camera, no real filesystem beyond a pytest tmp_path,
no network. CLAUDE.md § 3."""

from __future__ import annotations

import socket

from senses import ipc
from senses.eyes.capture import CameraPermissionError
from senses.eyes.fakes import FakeCameraDevice, fake_clock
from senses.eyes.main import SessionHolder, handle_message, run_forever
from senses.eyes.session import CameraSession, SessionNotArmedError

# --- CameraSession (session.py) ---------------------------------------


def test_capture_writes_a_real_jpeg_file_and_returns_it(tmp_path):
    device = FakeCameraDevice(frames=[b"jpeg-bytes-1"])
    session = CameraSession(device, "test", frames_dir=tmp_path)

    frame = session.capture()

    assert frame.path.exists()
    assert frame.path.read_bytes() == b"jpeg-bytes-1"
    assert frame.path.parent == tmp_path / session.id


def test_every_capture_asks_the_device_for_a_fresh_frame_never_reuses_one(tmp_path):
    device = FakeCameraDevice(frames=[b"frame-a", b"frame-b", b"frame-c"])
    session = CameraSession(device, "test", frames_dir=tmp_path)

    f1 = session.capture()
    f2 = session.capture()
    f3 = session.capture()

    assert device.read_count == 3
    assert len({f1.frame_id, f2.frame_id, f3.frame_id}) == 3  # all distinct ids
    assert [f1.path.read_bytes(), f2.path.read_bytes(), f3.path.read_bytes()] == [
        b"frame-a",
        b"frame-b",
        b"frame-c",
    ]


def test_capture_resets_the_idle_timeout(tmp_path):
    box, now = fake_clock()
    device = FakeCameraDevice()
    session = CameraSession(device, "test", now=now, idle_timeout_s=10, frames_dir=tmp_path)

    box[0] += 9  # just under the 10s idle window
    assert session.is_timed_out() is None
    session.capture()  # resets idle_until relative to the new "now"
    box[0] += 9  # would have been 18s since open -- but only 9s since the capture reset it
    assert session.is_timed_out() is None


def test_idle_timeout_fires_after_the_configured_window(tmp_path):
    box, now = fake_clock()
    session = CameraSession(
        FakeCameraDevice(),
        "test",
        now=now,
        idle_timeout_s=10,
        absolute_timeout_s=1000,
        frames_dir=tmp_path,
    )

    box[0] += 11
    assert session.is_timed_out() == "idle"


def test_absolute_timeout_fires_even_if_idle_never_would(tmp_path):
    box, now = fake_clock()
    # capture()s keep resetting idle, but absolute never resets.
    session = CameraSession(
        FakeCameraDevice(),
        "test",
        now=now,
        idle_timeout_s=1000,
        absolute_timeout_s=20,
        frames_dir=tmp_path,
    )

    box[0] += 21
    assert session.is_timed_out() == "cap"


def test_capture_after_timeout_raises_instead_of_silently_capturing(tmp_path):
    box, now = fake_clock()
    session = CameraSession(
        FakeCameraDevice(), "test", now=now, idle_timeout_s=5, frames_dir=tmp_path
    )
    box[0] += 6

    try:
        session.capture()
        raise AssertionError("expected SessionNotArmedError")
    except SessionNotArmedError:
        pass


def test_close_releases_the_device_and_deletes_unretained_frames(tmp_path):
    device = FakeCameraDevice(frames=[b"a", b"b"])
    session = CameraSession(device, "test", frames_dir=tmp_path)
    f1 = session.capture()
    f2 = session.capture()

    session.close("owner", keep_frame_ids=frozenset({f1.frame_id}))

    assert device.released is True
    assert f1.path.exists()
    assert not f2.path.exists()


def test_close_with_no_kept_frames_removes_the_whole_session_directory(tmp_path):
    device = FakeCameraDevice()
    session = CameraSession(device, "test", frames_dir=tmp_path)
    session.capture()
    session_dir = tmp_path / session.id

    session.close("owner")

    assert not session_dir.exists()


def test_close_is_idempotent_a_second_call_does_nothing(tmp_path):
    device = FakeCameraDevice()
    session = CameraSession(device, "test", frames_dir=tmp_path)
    session.capture()

    session.close("owner")
    session.close("owner")  # must not raise, must not double-release

    assert device.released is True


def test_a_device_that_fails_to_open_raises_camera_permission_error():
    device = FakeCameraDevice(fail_to_open=True)
    try:
        device.open()
        raise AssertionError("expected CameraPermissionError")
    except CameraPermissionError:
        pass


# --- handle_message (main.py) ------------------------------------------


def test_arm_creates_a_session_and_emits_camera_armed(tmp_path, monkeypatch):
    monkeypatch.setattr("senses.eyes.config.FRAMES_DIR", tmp_path)
    holder = SessionHolder()
    emitted = []

    handle_message(
        {"type": "arm", "reason": "look at this"},
        holder,
        lambda: FakeCameraDevice(),
        emitted.append,
    )

    assert holder.get() is not None
    assert emitted[0]["type"] == "camera.armed"
    assert emitted[0]["reason"] == "look at this"
    # Wire protocol is epoch-milliseconds (every timestamp in
    # shared/types.ts is Date.now()-based) -- session.expires_at is
    # epoch-seconds internally (time.time()'s own convention). A real
    # bug, found live (Phase 8's own verification pass): this was sent
    # unconverted, and the dashboard's countdown read a ~600s-away
    # session as "0s" (epoch-seconds is ~1000x smaller than epoch-ms, so
    # `expiresAt - Date.now()` went deeply negative and clamped to 0).
    # 1e12 is a safe threshold: any real epoch-ms value for a date after
    # 2001 exceeds it; a raw epoch-seconds value never does.
    assert emitted[0]["expiresAt"] > 1_000_000_000_000


def test_arm_while_already_armed_is_idempotent_no_second_device_open(tmp_path, monkeypatch):
    monkeypatch.setattr("senses.eyes.config.FRAMES_DIR", tmp_path)
    holder = SessionHolder()
    opened_devices = []

    def device_factory():
        d = FakeCameraDevice()
        opened_devices.append(d)
        return d

    emitted = []
    handle_message({"type": "arm", "reason": "r1"}, holder, device_factory, emitted.append)
    handle_message({"type": "arm", "reason": "r2"}, holder, device_factory, emitted.append)

    assert len(opened_devices) == 1
    assert emitted[0]["sessionId"] == emitted[1]["sessionId"]
    assert emitted[1]["expiresAt"] > 1_000_000_000_000  # the idempotent re-arm path converts too


def test_capture_without_arming_first_emits_an_honest_error():
    holder = SessionHolder()
    emitted = []

    handle_message({"type": "capture"}, holder, lambda: FakeCameraDevice(), emitted.append)

    assert emitted[0]["type"] == "error"
    assert "arm" in emitted[0]["message"].lower()


def test_capture_after_arm_emits_camera_captured(tmp_path, monkeypatch):
    monkeypatch.setattr("senses.eyes.config.FRAMES_DIR", tmp_path)
    holder = SessionHolder()
    emitted = []
    handle_message(
        {"type": "arm", "reason": "r"},
        holder,
        lambda: FakeCameraDevice(frames=[b"x"]),
        emitted.append,
    )

    handle_message({"type": "capture"}, holder, lambda: FakeCameraDevice(), emitted.append)

    assert emitted[1]["type"] == "camera.captured"
    assert "frameId" in emitted[1]


def test_arm_with_a_permission_failure_emits_error_not_a_session(tmp_path, monkeypatch):
    monkeypatch.setattr("senses.eyes.config.FRAMES_DIR", tmp_path)
    holder = SessionHolder()
    emitted = []

    handle_message(
        {"type": "arm", "reason": "r"},
        holder,
        lambda: FakeCameraDevice(fail_to_open=True),
        emitted.append,
    )

    assert emitted[0]["type"] == "error"
    assert holder.get() is None


def test_close_emits_camera_closed_and_clears_the_session(tmp_path, monkeypatch):
    monkeypatch.setattr("senses.eyes.config.FRAMES_DIR", tmp_path)
    holder = SessionHolder()
    emitted = []
    handle_message(
        {"type": "arm", "reason": "r"}, holder, lambda: FakeCameraDevice(), emitted.append
    )

    handle_message(
        {"type": "close", "cause": "owner"}, holder, lambda: FakeCameraDevice(), emitted.append
    )

    assert emitted[-1] == {
        "type": "camera.closed",
        "sessionId": emitted[0]["sessionId"],
        "cause": "owner",
    }
    assert holder.get() is None


def test_close_with_nothing_armed_is_a_silent_no_op_not_an_error():
    holder = SessionHolder()
    emitted = []

    handle_message(
        {"type": "close", "cause": "owner"}, holder, lambda: FakeCameraDevice(), emitted.append
    )

    assert emitted == []


def test_unknown_message_type_is_ignored_not_a_crash():
    holder = SessionHolder()
    emitted = []
    handle_message({"type": "something_else"}, holder, lambda: FakeCameraDevice(), emitted.append)
    assert emitted == []


# --- run_forever (socket-level, matching senses/voice's socketpair pattern) --


def test_run_forever_survives_one_bad_message_and_keeps_handling_later_ones(tmp_path, monkeypatch):
    monkeypatch.setattr("senses.eyes.config.FRAMES_DIR", tmp_path)
    a, b = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
    holder = SessionHolder()
    emitted = []
    try:
        ipc.send_line(a, {"type": "arm", "reason": "ok"})
        ipc.send_line(a, {"type": "capture"})  # fine, session is armed
        a.shutdown(socket.SHUT_WR)

        run_forever(b, holder, lambda: FakeCameraDevice(frames=[b"x"]), emitted.append)
    finally:
        a.close()
        b.close()

    types = [e["type"] for e in emitted]
    assert types == ["camera.armed", "camera.captured"]
