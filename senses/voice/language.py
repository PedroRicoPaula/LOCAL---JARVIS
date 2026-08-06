"""senses/voice/language.py — which voice a whole reply should use.
ADR-033 reversed CLAUDE.md § 0.1's English-only rule for the spoken
deliverable; this is the TTS-output half of that (senses/ears/config.py's
`LANGUAGE = "auto"` is the STT-input half).

One voice per whole response, not per sentence/segment (owner's own
choice, 2026-08-06) -- so this runs once on the complete text `voice/
main.py` receives, before `sentences.py` splits it for streamed playback,
and every sentence in that response uses the same voice it picks.

Boring word/diacritic scoring, no NLP dependency -- same reasoning as
`sentences.py`'s regex splitter. Real language detection libraries exist
(`langdetect`, `fasttext`) but a short spoken reply is exactly the case
those tend to guess wrong on (too little text), and this project's
CLAUDE.md § 3 prefers boring or none at all for something this size.
"""

from __future__ import annotations

import re

# A diacritic is real evidence of Portuguese, but not decisive alone --
# a single Portuguese proper noun (e.g. "Ponta Delgada, Açores", the exact
# place ADR-026's STT vocabulary hint exists for) can appear once inside
# an otherwise-English reply, and that shouldn't flip the whole response
# to the Portuguese voice. Counted as one point of evidence, same weight
# as one stopword match -- not an automatic override.
_PT_DIACRITICS = re.compile(r"[ãõçáéíóúâêô]", re.IGNORECASE)

# High-frequency function words, common enough that an ordinary sentence
# in that language accumulates several matches -- what actually
# distinguishes "a whole reply is in this language" from "this reply
# mentions one word/name from that language." Not exhaustive on purpose;
# boring and short, extend from real misfires during SOAK rather than
# trying to enumerate every stopword up front.
_PT_WORDS = frozenset([
    "que", "nao", "não", "para", "com", "isso", "voce", "você", "esta", "está",
    "são", "sao", "muito", "obrigado", "obrigada", "onde", "quando", "como",
    "porque", "sim", "mais", "menos", "hoje", "amanha", "amanhã", "ontem",
    "tudo", "nada", "aqui", "ali", "uma", "um", "uns", "umas", "meu", "minha",
    "teu", "tua", "seu", "sua", "isto", "aquilo", "ja", "já", "pode", "podes",
    "fazer", "vou", "vais", "esse", "essa", "depois", "agora", "ainda",
])
_EN_WORDS = frozenset([
    "the", "and", "you", "your", "what", "when", "where", "why", "how",
    "yes", "please", "thanks", "today", "tomorrow", "yesterday", "this",
    "that", "here", "there", "is", "are", "was", "were", "to", "for", "a",
    "an", "i'm", "im", "it's", "its", "of", "in", "on", "at", "be", "do",
    "does", "did", "have", "has", "will", "would", "can", "could", "should",
    "not", "no", "with", "next", "week", "fine", "good",
])

_WORD = re.compile(r"[a-zà-ÿ']+", re.IGNORECASE)


def detect_language(text: str) -> str:
    """Returns "pt" or "en". Defaults to "en" unless Portuguese evidence
    strictly outweighs English evidence -- the safer default given the
    owner's primary working language for code/docs/commands stays English
    (CLAUDE.md § 0.1), and a single incidental Portuguese word (a name, a
    place) shouldn't be enough on its own to flip the whole reply's voice."""
    words = {w.lower() for w in _WORD.findall(text)}
    pt_score = len(words & _PT_WORDS) + len(_PT_DIACRITICS.findall(text))
    en_score = len(words & _EN_WORDS)
    return "pt" if pt_score > en_score else "en"
