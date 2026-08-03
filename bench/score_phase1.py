#!/usr/bin/env python3
"""
score_phase1.py — Phase 1 DoD: 20 spoken sentences, >= 95% word accuracy.

Interactive: prints each sentence, you hold the hotkey and read it aloud
(same pipeline as senses/ears — real mic, real whisper-cli), release when
done. Scores word accuracy against the reference via word-level edit
distance (WER), the standard STT metric — not a fuzzy string match, so the
number means what the DoD says it means.

This is the one Phase 1 DoD check that needs your actual voice — nobody can
automate that part. Everything else about scoring it is automatic.

Usage
-----
    .venv/bin/python bench/score_phase1.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from senses.ears.audio_capture import MicAudioSource
from senses.ears.hotkey import PynputHotkey
from senses.ears.transcribe import WhisperCliTranscriber

# 20 varied sentences: short commands, longer explanations, numbers,
# technical terms — reflecting actual use, not a clean test set. Same
# philosophy as bench_local.py's CASES.
SENTENCES = [
    "Turn on the lights in the kitchen.",
    "What time is it right now?",
    "Remind me to call the dentist tomorrow morning.",
    "The quick brown fox jumps over the lazy dog.",
    "I need to buy milk, eggs, and bread from the store.",
    "Can you check the weather forecast for this weekend?",
    "My meeting is scheduled for three thirty in the afternoon.",
    "Please add two cups of flour and one teaspoon of salt.",
    "The server crashed twice last night around midnight.",
    "How many kilometers is it from Lisbon to Porto?",
    "I think the resistor should be two hundred and twenty ohms.",
    "Set a timer for fifteen minutes while the pasta cooks.",
    "The invoice total came to four hundred and seventy euros.",
    "Did you finish reviewing the pull request from yesterday?",
    "The wake word should trigger within one hundred milliseconds.",
    "Let's schedule the next sprint planning for Monday morning.",
    "I forgot my password again, can you help me reset it?",
    "The battery level on my laptop is at twelve percent.",
    "Please translate this sentence from English to Portuguese.",
    "Thanks for your help, that's exactly what I needed.",
]


def normalize(text: str) -> list[str]:
    text = text.lower()
    text = re.sub(r"[^\w\s']", "", text)
    return text.split()


def word_error_rate(reference: str, hypothesis: str) -> float:
    """Standard WER via word-level Levenshtein distance. 0.0 = perfect."""
    ref = normalize(reference)
    hyp = normalize(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0

    # dp[i][j] = edit distance between ref[:i] and hyp[:j]
    dp = [[0] * (len(hyp) + 1) for _ in range(len(ref) + 1)]
    for i in range(len(ref) + 1):
        dp[i][0] = i
    for j in range(len(hyp) + 1):
        dp[0][j] = j
    for i in range(1, len(ref) + 1):
        for j in range(1, len(hyp) + 1):
            if ref[i - 1] == hyp[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])

    return dp[len(ref)][len(hyp)] / len(ref)


def main() -> int:
    hotkey = PynputHotkey()
    audio_source = MicAudioSource()
    transcriber = WhisperCliTranscriber()

    print(f"Phase 1 word-accuracy check — {len(SENTENCES)} sentences.")
    print("Hold the right Option key, read the sentence aloud, release.\n")

    accuracies: list[float] = []
    for i, sentence in enumerate(SENTENCES, 1):
        prompt = (
            f"[{i}/{len(SENTENCES)}] Press Enter, then hold the hotkey and say:\n"
            f'  "{sentence}"\n'
        )
        input(prompt)
        hotkey.wait_for_press()
        audio_source.start()
        hotkey.wait_for_release()
        wav_path = audio_source.stop()
        heard = transcriber.transcribe(wav_path)

        wer = word_error_rate(sentence, heard)
        accuracy = max(0.0, 1.0 - wer)
        accuracies.append(accuracy)
        print(f'  heard: "{heard}"  ->  accuracy {accuracy * 100:.1f}%\n')

    overall = sum(accuracies) / len(accuracies)
    print("=" * 62)
    print(f"  Overall word accuracy: {overall * 100:.1f}%  (need >= 95%)")
    print(f"  {'PASS' if overall >= 0.95 else 'FAIL'}")
    print("=" * 62)
    return 0 if overall >= 0.95 else 1


if __name__ == "__main__":
    raise SystemExit(main())
