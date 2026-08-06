from __future__ import annotations

from senses.voice.language import detect_language


def test_a_real_portuguese_sentence() -> None:
    assert detect_language("Está tudo bem, obrigado.") == "pt"


def test_plain_english_sentence() -> None:
    assert detect_language("Can you check the weather for tomorrow?") == "en"


def test_portuguese_sentence_with_no_diacritics_falls_back_to_word_scoring() -> None:
    assert detect_language("Isso nao esta na lista, tudo bem") == "pt"


def test_empty_text_defaults_to_english() -> None:
    assert detect_language("") == "en"


def test_one_incidental_portuguese_proper_noun_does_not_flip_an_english_reply() -> None:
    # "Açores" is ADR-026's own STT vocabulary hint -- a real place the
    # owner mentions. Its one diacritic inside an otherwise ordinary
    # English sentence shouldn't be enough to switch the whole reply to
    # the Portuguese voice; English stopwords in the rest of the sentence
    # should outweigh it.
    assert detect_language("The weather in the Açores looks fine tomorrow.") == "en"
