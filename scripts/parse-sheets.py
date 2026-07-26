#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parse-sheets.py — turn a messy Google Sheets markdown export into clean seed JSON.

INPUT   data/raw/sheets-export.md   (2079 lines, ~189k chars; committed, reproducible)
OUTPUT  src/data/sentences.json     (UTF-8, real Hangul, 2-space indent)

Run:    python3 scripts/parse-sheets.py
Deterministic: same input bytes always produce the same output bytes.


WHY THIS FILE NEEDS A CUSTOM PARSER
===================================

The export *looks* like one big markdown table. It is not. It is NINE
concatenated tables, each emitted by a separate Google-Sheets range, each
preceded by a blank header line (`|  |  | ... |`) and a `| :-: | :-: |`
alignment line. The declared column count differs per table:

  sec  header  data lines    cols  col-1 language  col-2 content
  ---  ------  -----------   ----  --------------  --------------------------
   1       1     3 - 109        4  KOREAN          English
   2     111   113 - 237        4  English         fluent Korean
   3     239   241 - 368        3  English         Netflix subtitle (U+200E)
   4     370   372 - 427        2  English         fluent Korean
   5     429   431 - 666        2  English         Netflix subtitle
   6     668   670 - 764       26  English         Netflix subtitle
   7     766   768 - 959        3  English         Netflix subtitle
   8     961   963 - 1244       2  English         Netflix subtitle
   9    1246  1248 - 2079       3  English         Netflix subtitle (+col3 = fluent KO)

Sections are discovered at runtime by scanning for the alignment lines, so the
line numbers above are documentation, not hard-coded logic.

Two unrelated works are concatenated with zero English overlap:
  * sections 1-8  -> "Disenchantment" (Netflix series)
  * section  9    -> "Before Sunset"  (2004 film)


WHY POSITION-BASED COLUMN READING IS UNSAFE
===========================================

1. THE LANGUAGE COLUMNS SWAP. Section 1 is Korean-first (col1=KO, col2=EN);
   every other section is English-first. Reading "col1 = English" would
   mislabel 107 rows. We therefore never trust position: each row's language
   is decided by HANGUL CHARACTER RATIO over the two content cells. (Verified:
   0 misclassifications across all 1948 rows.)

2. COLUMN 3 IS SEMANTICALLY OVERLOADED. In sections 1/2/3/6/7 col3 is an
   English->Korean VOCABULARY NOTE. In section 9 col3 is a THIRD TRANSLATION
   (fluent Korean prose). Sections 4/5/8 have no col3 at all. The same index
   therefore means three different things, resolved per-section.

3. NOTES ESCAPE THEIR COLUMN. One genuine vocabulary note sits in col4
   (line 170), and one pronoun-antecedent study note sits in col1 of a
   Korean-first section (line 44). Section 6 declares 26 columns, of which
   ~24 are empty padding that also carries junk pasted from an unrelated
   school document. So every column must be scanned, then filtered by content.

4. HEADER ROWS APPEAR MID-FILE, *BELOW* their separator. Lines 963 and 1248
   are `| Subtitle | Human Translation |` rows sitting in the data range.
   Position alone cannot exclude them; they are matched by content.

5. A 102-LINE LLM CHAT TRANSCRIPT is pasted inside section 5 (lines 565-666):
   60 rows whose col2 is empty plus 42 blank rows. It is not subtitle data.
   It is excluded from `sentences` and mined separately into `chatVocab`.

6. THE EXPORT IS TRUNCATED. The final line (2079) has no closing pipe and its
   last cell is cut mid-word. It is kept (English + complete 2nd cell salvaged)
   but flagged `truncated: true` rather than silently dropped.


CLEANING NOTES
==============
* Backslash escapes are undone in TWO passes: double-escaped sequences such as
  `\\\\\\*\\\\\\*` and `\\\\\\~` exist. `\\-` is unescaped to `-`, never stripped,
  because it doubles as a subtitle speaker dash and as part of `\\---` rules.
* U+200E (LRM) is Netflix's intra-cell subtitle line break (1367 of them).
  It becomes a single space in `ko`, and the pre-conversion string is kept in
  `koSubtitleRaw` so line structure is not lost.
* Mojibake emoji (UTF-8 bytes read as Latin-1) are repaired only when the
  latin-1 -> utf-8 round trip succeeds.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "sheets-export.md"
OUT = ROOT / "src" / "data" / "sentences.json"

LRM = "‎"      # LEFT-TO-RIGHT MARK  - subtitle line break
ZWSP = "​"     # ZERO WIDTH SPACE    - noise

# The pasted LLM chat transcript inside section 5 (inclusive, 1-indexed).
CHAT_START, CHAT_END = 565, 666

WORKS = {
    "disenchantment": dict(id="disenchantment", title="Disenchantment",
                           kind="series", sections=[1, 2, 3, 4, 5, 6, 7, 8], prefix="dis"),
    "before-sunset": dict(id="before-sunset", title="Before Sunset",
                          kind="film", sections=[9], prefix="bsu"),
}

# Sections whose Korean column is a Netflix subtitle (LRM-delimited).
SUBTITLE_SECTIONS = {3, 5, 6, 7, 8, 9}
# Sections carrying a distinct third (fluent Korean) translation column.
KO_FLUENT_SECTIONS = {9}
# Sections where col3+ holds vocabulary notes.
VOCAB_SECTIONS = {1, 2, 3, 4, 5, 6, 7, 8}

HANGUL = re.compile(r"[가-힣ᄀ-ᇿ㄰-㆏]")
LATIN = re.compile(r"[A-Za-z]")
TERMINAL_PUNCT = tuple(".!?…\"')]")

MOJIBAKE = {
    "ð": "\U0001f44d",  # thumbs up
    "ð": "\U0001f4dd",  # memo
    "ð": "\U0001f449",  # pointing right
}

# Words that mark a bracketed span as a sound/action cue rather than a speaker.
SOUND_WORDS = {
    "laugh", "laughs", "laughing", "chuckle", "chuckles", "snickers",
    "gasp", "gasps", "groan", "groans", "grunt", "grunts", "grunting",
    "sigh", "sighs", "scoffs", "snorts", "slurps", "sniffles", "sniffs",
    "screams", "shrieks", "yelps", "burps", "stammering", "stutters",
    "exclaims", "inhales", "applause", "chimes", "cheering", "mimics",
    "clears", "throat", "weakly", "voice", "static", "continues",
}

# Speaker names / role labels that may appear bracketed in the English cell.
SPEAKER_TOKENS = {
    "bean", "tiabeanie", "elfo", "luci", "zog", "oona", "derek", "merkimer",
    "sorcerio", "odval", "guysbert", "pendergast", "turbish", "moonpence",
    "gretel", "jo", "mertz", "mertz's", "jesse", "celine",
    "superviso", "supervisor",
    "man", "woman", "mother", "captain", "griffin", "herald", "jester",
    "both", "hay", "2",
}

# Known misspellings preserved verbatim but flagged.
KNOWN_TYPOS = {"raivings"}


# --------------------------------------------------------------------------- #
# cleaning primitives
# --------------------------------------------------------------------------- #

def fix_mojibake(s: str) -> str:
    """Repair UTF-8-read-as-Latin-1 emoji, but only where it round-trips."""
    for bad, good in MOJIBAKE.items():
        s = s.replace(bad, good)
    return s


def unescape(s: str) -> str:
    """Undo markdown backslash escapes. Two passes: double escapes exist.

    `\\-` becomes `-` (never removed) so speaker dashes and `\\---` rules survive.
    """
    for _ in range(2):
        s = re.sub(r"\\(.)", r"\1", s)
    return s


def normalise(s: str, keep_lrm: bool = False, keep_double_space: bool = False) -> str:
    """Full cell clean.

    `keep_lrm`          preserves U+200E for the `koSubtitleRaw` field.
    `keep_double_space` skips the whitespace-collapse step. Vocabulary cells
        need this: a run of two spaces is the pseudo-separator between two
        entries packed into one cell (`shame 유감이다  dainty 우아한 까다로운`),
        so collapsing it first would make multi-entry cells unsplittable.
    """
    s = fix_mojibake(s)
    s = unescape(s)
    s = s.replace(ZWSP, "")
    s = s.replace("&amp;", "&")
    s = (s.replace("’", "'").replace("‘", "'")
          .replace("“", '"').replace("”", '"'))
    if not keep_lrm:
        s = s.replace(LRM, " ")
    # normalise exotic whitespace to plain spaces (LRM is not whitespace)
    s = re.sub(r"[^\S ]+", " ", s)
    if not keep_double_space:
        s = re.sub(r" {2,}", " ", s)
    return s.strip()


def hangul_ratio(s: str):
    """Fraction of alphabetic characters that are Hangul. None if no letters."""
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return None
    return sum(1 for c in letters if HANGUL.match(c)) / len(letters)


# --------------------------------------------------------------------------- #
# English-cell annotation extraction
# --------------------------------------------------------------------------- #

def classify_bracket(content: str, glued: bool) -> str:
    """'speaker' | 'sound' | 'inline'.

    `glued` means the closing bracket is immediately followed by a word
    character or apostrophe, i.e. the span is grammatically part of the
    sentence (`[while you work]'s`) and must stay in `en`.
    """
    if glued:
        return "inline"
    tokens = [t.strip(".,:;!?'\"").lower() for t in content.split()]
    tokens = [t for t in tokens if t]
    if not tokens:
        return "inline"
    if any(t in SOUND_WORDS for t in tokens):
        return "sound"
    if all(t in SPEAKER_TOKENS for t in tokens):
        return "speaker"
    return "inline"


def extract_en_annotations(en: str):
    """Pull speaker / sound cues / study markers out of the English cell.

    Returns (clean_en, speaker|None, sound_cues[], study_markers[]).
    Bracketed spans that are neither a speaker nor a sound cue are *content
    insertions* (e.g. `[that fat kid with the crown]`); they are unbracketed
    and kept, because deleting them would destroy the sentence.
    """
    speaker = None
    sounds: list[str] = []
    markers: list[str] = []

    # ALL-CAPS speaker prefix, e.g. "WOMAN: ..." / "JESSE: ..."
    m = re.match(r"^([A-Z][A-Z' ]{1,20}):\s*", en)
    if m:
        speaker = m.group(1).strip()
        en = en[m.end():]

    def repl(match: re.Match) -> str:
        nonlocal speaker
        content = match.group(1).strip()
        tail = en[match.end():match.end() + 1]
        kind = classify_bracket(content, glued=bool(re.match(r"[\w']", tail)))
        if kind == "speaker":
            if speaker is None:
                speaker = content
            return ""
        if kind == "sound":
            sounds.append(content)
            return ""
        return content  # inline insertion: keep the words, drop the brackets

    en = re.sub(r"\[([^\]]*)\]", repl, en)

    # Korean grammar-study annotations leaking into the English cell.
    if "(도치)" in en:                      # (도치) = inversion
        markers.append("(도치)")
        en = en.replace("(도치)", " ")
    if re.search(r"(?<!\S)//(?!\S)|//", en):
        n = len(re.findall(r"//", en))
        markers.extend(["//"] * n)
        en = en.replace("//", " ")

    en = re.sub(r"\s+([,.!?;:])", r"\1", en)
    en = re.sub(r"\s{2,}", " ", en).strip()
    en = re.sub(r"^[,;:]\s*", "", en).strip()
    return en, speaker, sounds, markers


# --------------------------------------------------------------------------- #
# vocabulary-note parsing (tolerant: only 17% of cells use a colon separator)
# --------------------------------------------------------------------------- #

def split_multi_entry(cell: str) -> list[str]:
    """Split a cell holding several entries on `  ` followed by a Latin run.

    Two spaces followed by Korean is a pseudo-separator inside one gloss
    (`kick back  편하게 쉬다`) and must NOT split.
    """
    parts = re.split(r"\s{2,}(?=[A-Za-z])", cell)
    return [p.strip() for p in parts if p.strip()]


def parse_term_gloss(entry: str):
    """Leading Latin-script run = term, remainder = Korean gloss.

    Handles `term : gloss`, `term gloss`, `termgloss` (no separator),
    ALL-CAPS headwords, punctuation glued to the headword, and placeholder
    templates like `make a out of b b를 a로 만들다.` where the final Latin
    token is glued to Hangul and therefore belongs to the gloss.
    """
    m = HANGUL.search(entry)
    if not m:
        return None
    cut = m.start()
    # If the Latin text is glued straight onto the Hangul, that last token
    # usually belongs to the gloss (`b를`) -- unless backing up empties the term
    # (`latticework격자무늬`), in which case split exactly at the Hangul.
    if cut > 0 and LATIN.match(entry[cut - 1]):
        back = cut
        while back > 0 and not entry[back - 1].isspace():
            back -= 1
        if entry[:back].strip():
            cut = back
    term = entry[:cut].strip()
    gloss = entry[cut:].strip()
    term = re.sub(r"\s*:\s*$", "", term).strip()      # drop colon separator
    term = term.strip(".,;:").strip()                 # `mellow.` -> `mellow`
    gloss = re.sub(r"^[:\s]+", "", gloss).strip()
    if not term or not LATIN.search(term):
        return None
    return term, gloss


def parse_vocab_cell(cell: str):
    """Return [(term, gloss), ...] for a candidate note cell, or [].

    `cell` must be the double-space-preserving rendering so that multi-entry
    cells can still be split; each resulting term/gloss is collapsed after.
    """
    out = []
    for entry in split_multi_entry(cell):
        pg = parse_term_gloss(entry)
        if pg:
            term, gloss = pg
            out.append((re.sub(r"\s{2,}", " ", term).strip(),
                        re.sub(r"\s{2,}", " ", gloss).strip()))
    return out


def is_vocab_candidate(cell: str) -> bool:
    """A genuine note starts with a Latin letter and contains Hangul.

    This rejects every piece of junk found in the padding columns: dates
    (`8월 26일`), numbered list fragments pasted from a school document
    (`2. 급식 안내`), and stray keystrokes (`ㅂ`, `ㅂㅂㅂ`).
    """
    if not cell:
        return False
    if not re.match(r"^[A-Za-z]", cell):
        return False
    return bool(HANGUL.search(cell))


# --------------------------------------------------------------------------- #
# chat-block vocabulary mining (lines 565-666)
# --------------------------------------------------------------------------- #

def parse_chat_vocab(lines: list[str]) -> list[dict]:
    """Mine the 10 numbered entries out of the pasted LLM chat transcript."""
    cells = []
    for ln in range(CHAT_START, CHAT_END + 1):
        raw = lines[ln - 1]
        parts = raw.strip().strip("|").split("|")
        cell = normalise(parts[0]) if parts else ""
        if cell:
            cells.append(cell)

    entries: list[dict] = []
    cur = None
    for cell in cells:
        head = re.match(r"^#{1,6}\s*\d+\.\s*(.+)$", cell)
        if head:
            title = head.group(1).strip()
            title = title.replace("**", "").strip()
            paren = ""
            pm = re.match(r"^(.*?)\s*\((.+)\)\s*$", title)
            if pm:
                title, paren = pm.group(1).strip(), pm.group(2).strip()
            cur = dict(term=title, gloss="", example="", synonyms=[],
                       _paren=paren, _extra=[])
            entries.append(cur)
            continue
        if cur is None:
            continue
        # Horizontal rules (`\---` -> `---`) must be dropped BEFORE the bullet
        # stripper runs, otherwise it eats one dash and leaves a stray `--`.
        if re.fullmatch(r"-{3,}", cell.strip()):
            continue
        body = re.sub(r"^[*\-•]\s*", "", cell).strip()
        body = body.replace("**", "").strip()
        if not body or re.fullmatch(r"-{2,}", body):
            continue
        gm = re.match(r"^뜻\s*[:：]\s*(.+)$", body)          # 뜻:
        if gm:
            cur["gloss"] = gm.group(1).strip()
            continue
        em = re.match(r"^✔?\s*예\s*[:：]\s*(.+)$", body)  # ✔ 예:
        if em:
            cur["example"] = em.group(1).strip().strip("*").strip()
            continue
        sm = re.match(r"^(?:유사\s*표현|관련\s*표현)"
                      r"\s*[:：]\s*(.+)$", body)                   # 유사/관련 표현:
        if sm:
            cur["synonyms"].extend(
                [t.strip() for t in re.split(r"[,、]", sm.group(1)) if t.strip()])
            continue
        if body.rstrip(":：").strip() == "비교":   # 비교: -> comparison sub-list
            cur["_cmp"] = True
            continue
        if body.startswith("→"):                    # → Korean rendering of the example
            continue
        cur["_extra"].append(body)

    # 비교 sub-bullets look like `corrupt (권력·돈 때문에 부패)` -> synonym + note
    for e in entries:
        if e.get("_cmp"):
            for x in list(e["_extra"]):
                mm = re.match(r"^([A-Za-z][A-Za-z\s'/-]*)\s*\((.+)\)$", x)
                if mm:
                    e["synonyms"].append(mm.group(1).strip())
                    e["_extra"].remove(x)
    for e in entries:
        # Entries 7-9 carry no `뜻:` line: fall back to their definition
        # bullets, then to the parenthetical in the heading.
        if not e["gloss"] and e["_extra"]:
            e["gloss"] = "; ".join(e["_extra"])
        if not e["gloss"]:
            e["gloss"] = e["_paren"]
        elif e["_paren"] and e["_paren"] not in e["gloss"]:
            e["gloss"] = f"{e['gloss']} ({e['_paren']})"
        for k in ("_paren", "_extra", "_cmp"):
            e.pop(k, None)
        e["origin"] = "chat-block"
    return entries


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #

def main() -> None:
    text = RAW.read_text(encoding="utf-8")
    lines = text.split("\n")

    # ---- discover sections from the alignment lines -----------------------
    aligns = [i + 1 for i, l in enumerate(lines) if ":-:" in l]
    sections = []
    for k, a in enumerate(aligns):
        # Tables are separated by: <blank line>, <blank header>, <alignment>.
        # So this section's data ends 3 lines before the next alignment line.
        end = (aligns[k + 1] - 3) if k + 1 < len(aligns) else len(lines)
        sections.append(dict(section=k + 1, header=a - 1, start=a + 1, end=end,
                             cols=lines[a - 1].count("|") - 1))

    excluded = Counter()
    rows = []          # raw per-row records, in file order

    for sec in sections:
        s_no = sec["section"]
        for ln in range(sec["start"], sec["end"] + 1):
            raw = lines[ln - 1]

            if CHAT_START <= ln <= CHAT_END:
                excluded["chat_transcript_block"] += 1
                inner = raw.strip().strip("|").replace("|", "").strip()
                if inner:
                    excluded["chat_transcript_block_data"] += 1
                else:
                    excluded["chat_transcript_block_blank"] += 1
                continue

            truncated = not raw.rstrip().endswith("|")
            parts = raw.strip()
            if parts.startswith("|"):
                parts = parts[1:]
            if parts.endswith("|"):
                parts = parts[:-1]
            cells_raw = parts.split("|")

            cells = [normalise(c) for c in cells_raw]
            cells_lrm = [normalise(c, keep_lrm=True) for c in cells_raw]
            # vocabulary cells keep their double spaces (entry separator)
            cells_ds = [normalise(c, keep_double_space=True) for c in cells_raw]

            if not any(cells):
                excluded["all_blank_row"] += 1
                continue

            # mid-file header rows sitting below their separator
            if (len(cells) >= 2 and cells[0].lower() == "subtitle"
                    and cells[1].lower().startswith("human translation")):
                excluded["mid_file_header_row"] += 1
                continue

            rows.append(dict(section=s_no, line=ln, cells=cells,
                             cells_lrm=cells_lrm, cells_ds=cells_ds,
                             truncated=truncated))

    # ---- build sentences --------------------------------------------------
    sentences = []
    vocab_notes = []
    counters = Counter()
    lang_ambiguous = 0

    for rec in rows:
        s_no = rec["section"]
        cells, cells_lrm = rec["cells"], rec["cells_lrm"]
        c0 = cells[0] if len(cells) > 0 else ""
        c1 = cells[1] if len(cells) > 1 else ""

        # ---- language assignment by Hangul ratio, never by position ------
        r0, r1 = hangul_ratio(c0), hangul_ratio(c1)
        study_from_cell = []
        if r0 is None and r1 is None:
            en_i, ko_i = 0, 1
        elif r1 is None:
            en_i, ko_i = (1, 0) if (r0 or 0) > 0.3 else (0, 1)
        elif r0 is None:
            en_i, ko_i = (0, 1) if (r1 or 0) > 0.3 else (1, 0)
        else:
            if abs(r0 - r1) < 0.1:
                # Both cells are the same script. Line 44 is the only case:
                # col1 holds an English pronoun-antecedent note (`them : eyes`)
                # in a Korean-first section, so there is no Korean at all.
                lang_ambiguous += 1
                if r0 < 0.3 and r1 < 0.3:
                    longer = 0 if len(c0.split()) >= len(c1.split()) else 1
                    en_i, ko_i = longer, 1 - longer
                    note = cells[ko_i]
                    if note:
                        study_from_cell.append(note)
                    cells = list(cells)
                    cells[ko_i] = ""
                    cells_lrm = list(cells_lrm)
                    cells_lrm[ko_i] = ""
                else:
                    en_i, ko_i = 0, 1
            else:
                en_i, ko_i = (0, 1) if r0 < r1 else (1, 0)

        en_raw = cells[en_i] if en_i < len(cells) else ""
        ko_raw = cells[ko_i] if ko_i < len(cells) else ""
        ko_raw_lrm = cells_lrm[ko_i] if ko_i < len(cells_lrm) else ""

        # ---- lyrics ------------------------------------------------------
        is_lyric = "♪" in en_raw or "♪" in ko_raw
        en_raw = en_raw.replace("♪", " ")
        ko_raw = ko_raw.replace("♪", " ")
        ko_raw_lrm = ko_raw_lrm.replace("♪", " ")

        en, speaker, sounds, markers = extract_en_annotations(en_raw)
        markers = study_from_cell + markers
        ko = re.sub(r"\s{2,}", " ", ko_raw).strip()
        ko_lrm = ko_raw_lrm.strip()

        work = "before-sunset" if s_no == 9 else "disenchantment"

        ko_subtitle_raw = ko_lrm if s_no in SUBTITLE_SECTIONS else None
        ko_fluent = None
        if s_no in KO_FLUENT_SECTIONS and len(cells) > 2:
            ko_fluent = cells[2] or None

        # ---- vocabulary notes on this row --------------------------------
        row_terms = []
        if s_no in VOCAB_SECTIONS:
            cells_ds = rec["cells_ds"]
            for ci in range(2, len(cells_ds)):
                cell = cells_ds[ci]
                if not is_vocab_candidate(cell):
                    if cell:
                        counters["vocab_cells_rejected"] += 1
                    continue
                parsed = parse_vocab_cell(cell)
                if not parsed:
                    counters["vocab_cells_rejected"] += 1
                    continue
                counters["vocab_cells_accepted"] += 1
                for term, gloss in parsed:
                    row_terms.append((term, gloss, ci + 1))

        words = en.split()
        wc = len(words)
        ends_open = not en.endswith(TERMINAL_PUNCT) if en else True
        starts_lower = bool(en) and en[0].islower()

        sentences.append(dict(
            _line=rec["line"], _section=s_no, _work=work,
            en=en, ko=ko, ko_subtitle_raw=ko_subtitle_raw, ko_fluent=ko_fluent,
            speaker=speaker, sounds=sounds, markers=markers,
            wc=wc, ends_open=ends_open, starts_lower=starts_lower,
            is_lyric=is_lyric, truncated=rec["truncated"], row_terms=row_terms,
        ))

    # ---- ids --------------------------------------------------------------
    seq = Counter()
    for s in sentences:
        prefix = WORKS[s["_work"]]["prefix"]
        seq[prefix] += 1
        s["id"] = f"{prefix}-{seq[prefix]:04d}"

    # ---- fragment relations (within a section, file order) -----------------
    for i, s in enumerate(sentences):
        prev = sentences[i - 1] if i > 0 else None
        same = prev is not None and prev["_section"] == s["_section"]
        s["continues_previous"] = bool(s["starts_lower"] and same and prev["ends_open"])
        s["self_contained"] = not (s["continues_previous"] or s["ends_open"] or s["wc"] <= 2)

    # ---- Korean-prefix pairs (subtitle-block artefact) ---------------------
    ko_superseded = 0
    for i, s in enumerate(sentences):
        s["ko_superseded"] = False
    for i in range(len(sentences) - 1):
        a, b = sentences[i], sentences[i + 1]
        if a["_section"] != b["_section"]:
            continue
        ka, kb = a["ko"], b["ko"]
        if ka and kb and ka != kb and kb.startswith(ka):
            a["ko_superseded"] = True
            ko_superseded += 1

    # ---- emit -------------------------------------------------------------
    out_sentences = []
    for s in sentences:
        terms = [t for t, _g, _c in s["row_terms"]]
        for term, gloss, col in s["row_terms"]:
            vocab_notes.append(dict(
                term=term, gloss=gloss, work=s["_work"], sourceLine=s["_line"],
                sentenceId=s["id"], origin="sheet-column",
                possibleTypo=term.lower() in KNOWN_TYPOS,
                sourceColumn=col,
            ))
        out_sentences.append(dict(
            id=s["id"], work=s["_work"], section=s["_section"], sourceLine=s["_line"],
            en=s["en"], ko=s["ko"],
            koSubtitleRaw=s["ko_subtitle_raw"], koFluent=s["ko_fluent"],
            speaker=s["speaker"],
            wordCount=s["wc"], selfContained=s["self_contained"],
            continuesPrevious=s["continues_previous"], endsOpen=s["ends_open"],
            startsLower=s["starts_lower"], koSupersededByNext=s["ko_superseded"],
            isLyric=s["is_lyric"], soundCues=s["sounds"], studyMarkers=s["markers"],
            vocabNote=("; ".join(terms) if terms else None),
            truncated=s["truncated"],
        ))

    chat_vocab = parse_chat_vocab(lines)

    per_work = Counter(s["work"] for s in out_sentences)
    works = []
    for key, meta in WORKS.items():
        works.append(dict(id=meta["id"], title=meta["title"], kind=meta["kind"],
                          sections=meta["sections"], sentenceCount=per_work[key]))

    stats = {
        "sourceFile": "data/raw/sheets-export.md",
        "sourceLines": len(lines),
        "sourceChars": len(text),
        "sectionsDetected": len(sections),
        "sectionColumnCounts": [sec["cols"] for sec in sections],
        "totalSentences": len(out_sentences),
        "sentencesByWork": {k: per_work[k] for k in WORKS},
        "sentencesBySection": {str(sec["section"]):
                               sum(1 for s in out_sentences if s["section"] == sec["section"])
                               for sec in sections},
        "selfContained": sum(1 for s in out_sentences if s["selfContained"]),
        "fragments": sum(1 for s in out_sentences if not s["selfContained"]),
        "endsOpen": sum(1 for s in out_sentences if s["endsOpen"]),
        "startsLower": sum(1 for s in out_sentences if s["startsLower"]),
        "continuesPrevious": sum(1 for s in out_sentences if s["continuesPrevious"]),
        "singleWord": sum(1 for s in out_sentences if s["wordCount"] <= 1),
        "wordCountLE2": sum(1 for s in out_sentences if s["wordCount"] <= 2),
        "koSupersededByNext": ko_superseded,
        "withSpeaker": sum(1 for s in out_sentences if s["speaker"]),
        "withSoundCues": sum(1 for s in out_sentences if s["soundCues"]),
        "withStudyMarkers": sum(1 for s in out_sentences if s["studyMarkers"]),
        "lyrics": sum(1 for s in out_sentences if s["isLyric"]),
        "truncatedRows": sum(1 for s in out_sentences if s["truncated"]),
        "emptyKo": sum(1 for s in out_sentences if not s["ko"]),
        "emptyEn": sum(1 for s in out_sentences if not s["en"]),
        "withKoSubtitleRaw": sum(1 for s in out_sentences if s["koSubtitleRaw"]),
        "withKoFluent": sum(1 for s in out_sentences if s["koFluent"]),
        "vocabNotes": len(vocab_notes),
        "vocabNoteCells": counters["vocab_cells_accepted"],
        "vocabCellsRejected": counters["vocab_cells_rejected"],
        "vocabNotesWithTypoFlag": sum(1 for v in vocab_notes if v["possibleTypo"]),
        "chatVocab": len(chat_vocab),
        "languageAmbiguousRows": lang_ambiguous,
        "excludedRows": dict(excluded),
        # chat_transcript_block_* are a breakdown of chat_transcript_block,
        # so they are not added into the total.
        "excludedTotal": (excluded["chat_transcript_block"]
                          + excluded["all_blank_row"]
                          + excluded["mid_file_header_row"]),
        "allBlankRowsIncludingChatBlock": (excluded["all_blank_row"]
                                           + excluded["chat_transcript_block_blank"]),
    }

    doc = {
        "sourceDatabase": "Google Sheets · 영어 학습 시트",
        "works": works,
        "sentences": out_sentences,
        "vocabNotes": vocab_notes,
        "chatVocab": chat_vocab,
        "stats": stats,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
