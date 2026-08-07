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
# ADR-033's bilingual reversal, TTS half. "Joana" (female) was the only
# pt_PT voice `say -v '?'` listed as installed (checked live, 2026-08-06),
# so the reply's voice changed gender by language -- English (Daniel,
# male) vs Portuguese (Joana, female). Owner's own call (2026-08-07):
# wanted a male pt_PT voice instead, to match Daniel. Real gap found the
# same day: `say -v '?'` never listed a male pt_PT option -- but macOS
# actually ships one ("Joaquim," `com.apple.voice.compact.pt-PT.Joaquim`,
# confirmed via TextToSpeech.framework's own VoiceIdSampleStringMap.plist,
# not guessed), and `say -v Joaquim -o test.aiff "..."` produced a real,
# valid 4.7s audio file live-tested the same day even though `say -v '?'`
# still doesn't list it -- compact-tier voices are apparently usable
# on-demand without the explicit "download" System Settings normally
# requires for Enhanced/Premium tiers. Confirmed working, not assumed.
SAY_VOICE_PT = os.environ.get("JARVIS_SAY_VOICE_PT", "Joaquim")
