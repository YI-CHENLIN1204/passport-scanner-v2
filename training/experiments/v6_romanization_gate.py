"""Offline-only romanized-name corroboration; NEVER uses annotation truth."""
import re

def norm_latin(value):
    return re.sub(r'[^A-Z]', '', str(value or '').upper())

def corroborate_candidates(proposals, observed_english, transliterate):
    """Requires OCR-derived English, not ground-truth name; no fuzzy acceptance."""
    expected=norm_latin(observed_english)
    if not expected or len(expected)<4:
        return 'no-ocr-english', []
    if not proposals:
        return 'no-candidates', []
    valid=[]
    for proposal in proposals:
        romanized=norm_latin(transliterate(proposal.text))
        if romanized and romanized==expected:
            valid.append(proposal)
    if len(valid)==1:
        return 'single-exact-romanization', valid
    if len(valid)>1:
        return 'ambiguous', valid
    return 'no-exact-romanization', []

def pypinyin_romanize(name):
    """Experimental mainland-default readings; Taiwan-specific variants may differ."""
    from pypinyin import lazy_pinyin
    return ''.join(lazy_pinyin(name))
