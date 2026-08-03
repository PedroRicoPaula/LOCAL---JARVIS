"""No network, no whisper-server — just the non-speech marker filter."""

from __future__ import annotations

from senses.ears.transcribe import _NON_SPEECH_MARKER


def test_filters_whisper_non_speech_markers() -> None:
    """whisper.cpp's own placeholder for "no discernible speech" —
    confirmed live: a wake-word-triggered capture with no real command in
    it came back transcribed as the literal string "[BLANK_AUDIO]". Never
    guessed at applies to whisper's own non-speech markers too, not just
    to genuinely empty output — this must be treated as empty."""
    assert _NON_SPEECH_MARKER.match("[BLANK_AUDIO]")
    assert _NON_SPEECH_MARKER.match("[SILENCE]")
    assert _NON_SPEECH_MARKER.match("(silence)")


def test_does_not_filter_real_speech() -> None:
    assert not _NON_SPEECH_MARKER.match("What's the weather like today?")
    assert not _NON_SPEECH_MARKER.match("turn on the lights")
    assert not _NON_SPEECH_MARKER.match("")
