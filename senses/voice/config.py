"""senses/voice/config.py — constants, not a framework."""

from __future__ import annotations

import os
from pathlib import Path

SOCKET_PATH = Path(os.environ.get("JARVIS_VOICE_SOCKET", "/tmp/jarvis-voice.sock"))

SAY_BIN = os.environ.get("JARVIS_SAY_BIN", "say")
# Explicit, not the system default: this machine has no SelectedVoiceName
# configured at all, so unset `say` falls back to whatever's first in its
# internal list — which turned out to be a novelty voice, garbled enough
# that even a correct STT pipeline couldn't transcribe it. See PROGRESS.md's
# Phase 1 log. ADR-004: `say` in Phase 1, Piper from Phase 2.
# Male, British English — owner's choice, post Phase-5-integration live
# test (see PROGRESS.md). Was "Samantha" (female) through Phases 1-5.
SAY_VOICE = os.environ.get("JARVIS_SAY_VOICE", "Daniel")
