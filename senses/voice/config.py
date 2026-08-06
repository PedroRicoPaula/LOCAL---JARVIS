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
# ADR-033's bilingual reversal, TTS half: "Joana" is the only pt_PT voice
# installed on this machine (`say -v '?'`, checked live, 2026-08-06) --
# not a choice among several, the only real option today. Owner's own
# call: ship with it now (voice changes gender by language until a second
# pt_PT voice is installed via System Settings) rather than block on that.
SAY_VOICE_PT = os.environ.get("JARVIS_SAY_VOICE_PT", "Joana")
