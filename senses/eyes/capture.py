"""senses/eyes/capture.py — camera device in, JPEG bytes out.

`CameraDevice` is deliberately the smallest possible surface (open, grab
one frame as JPEG bytes, release) — `session.py` owns the ARMED/CAPTURE
state machine and timeouts; this module only ever touches the physical
device. Real implementation uses `opencv-python` (`cv2.VideoCapture`) --
the boring, standard choice for a single frame grab, no need for
`pyobjc`/AVFoundation's extra native-binding complexity for this.

First real use triggers a genuine macOS Camera permission (TCC) prompt --
owner-required, same shape as Phase 1's Microphone/Accessibility grants
(PROGRESS.md's Phase 1 log). Nothing here can grant that permission
programmatically; a `CameraPermissionError` surfaces the real OS-level
failure honestly instead of hanging or guessing why `read()` failed.
"""

from __future__ import annotations

from typing import Any, Protocol

import cv2

from senses.eyes.config import CAMERA_DEVICE_INDEX, JPEG_QUALITY


class CameraPermissionError(RuntimeError):
    """The camera could not be opened or read from -- most likely macOS
    Camera permission was never granted (or was revoked) for whatever
    process is running this. Not raised for "someone else is using the
    camera" specifically -- OpenCV/AVFoundation don't reliably
    distinguish the two reasons, so the message says both are possible."""


class CameraDevice(Protocol):
    def open(self) -> None:
        """Acquires the physical device. Raises CameraPermissionError if
        it can't be opened."""
        ...

    def read_frame(self) -> bytes:
        """Grabs one frame, returns it JPEG-encoded. Raises
        CameraPermissionError if the read fails."""
        ...

    def read_raw_frame(self) -> Any:
        """Grabs one frame as a raw BGR numpy array, unencoded -- for
        gesture tracking's hot path, which feeds a local model directly
        and would otherwise pay a pointless JPEG encode/decode round trip
        every frame. Returns whatever OpenCV returns (typed loosely on
        purpose: `senses/eyes`'s own fakes don't import numpy, and this
        module is the only place that cares about the concrete type).
        Raises CameraPermissionError if the read fails."""
        ...

    def release(self) -> None:
        """Releases the physical device. Safe to call even if open()
        was never called or already failed."""
        ...


class OpenCvCameraDevice:
    def __init__(
        self, device_index: int = CAMERA_DEVICE_INDEX, jpeg_quality: int = JPEG_QUALITY
    ) -> None:
        self._device_index = device_index
        self._jpeg_quality = jpeg_quality
        self._cap: cv2.VideoCapture | None = None

    def open(self) -> None:
        cap = cv2.VideoCapture(self._device_index)
        if not cap.isOpened():
            cap.release()
            raise CameraPermissionError(
                f"could not open camera device {self._device_index} -- check macOS Camera "
                "permission (System Settings -> Privacy & Security -> Camera) for whatever "
                "process is running senses/eyes, or that no other app is holding the camera"
            )
        self._cap = cap

    def read_raw_frame(self) -> Any:
        if self._cap is None:
            raise CameraPermissionError("read_raw_frame() called before open()")
        ok, frame = self._cap.read()
        if not ok:
            raise CameraPermissionError(
                "camera device opened but a frame read failed -- permission may have been "
                "revoked mid-session, or the device disconnected"
            )
        return frame

    def read_frame(self) -> bytes:
        frame = self.read_raw_frame()
        encoded_ok, buffer = cv2.imencode(
            ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, self._jpeg_quality]
        )
        if not encoded_ok:
            raise CameraPermissionError("captured a frame but JPEG encoding failed")
        return buffer.tobytes()

    def release(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None
