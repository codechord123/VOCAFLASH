#!/usr/bin/env python3
"""읽기 화면에서 단어를 탭했을 때 띄울 사전을 만든다.

뜻은 여기저기 흩어져 있다 — 하이라이트 뜻풀이, 구문에서 뽑은 단어,
유닛 배정 어휘, 시트 메모, B2 단어장. 화면에서 다섯 군데를 뒤지게 하는
대신 하나로 합친다.

같은 단어가 여러 곳에 있으면 우선순위를 둔다: 장면 문맥이 붙은 것이
먼저다. "refuge = 보호소"보다 "셀린이 길 잃은 고양이들에게 만들어 주고
싶어 한 곳"이 기억에 남기 때문이다.

관련 구문도 같이 담는다. 단어 하나를 보다가 그 단어가 들어간 숙어를
같이 보면 쓰임이 잡힌다 — 랭귀지 리액터에서 관련 구동사를 보여주는 것과
같은 이유다.
"""

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
OUT = DATA / "word-dict.json"

MAX_CONTEXT = 160  # 문맥은 한 문장이면 충분하다. 긴 독백은 잘라 쓴다.


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def trim(text):
    if not text:
        return None
    t = " ".join(str(text).split())
    if len(t) <= MAX_CONTEXT:
        return t
    cut = t[:MAX_CONTEXT]
    dot = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
    return (cut[: dot + 1] if dot > 60 else cut.rstrip() + "…")


def main():
    dict_ = {}

    def put(word, entry, priority):
        """우선순위가 높은(숫자가 낮은) 자료가 이긴다."""
        key = (word or "").strip().lower()
        if not key or " " in key:
            return
        old = dict_.get(key)
        if old is None or priority < old["_p"]:
            entry["_p"] = priority
            dict_[key] = entry

    # 1) 구문에서 단어 단위로 뽑아낸 것 — 장면 문맥과 뉘앙스가 가장 촘촘하다
    for w in load("word-cards.json")["words"]:
        put(
            w["term"],
            {
                "ko": w["meaningKo"],
                "en": w.get("definitionEn"),
                "nuance": w.get("nuance"),
                "ctx": trim(w.get("context")),
                "who": w.get("speaker"),
                "ch": w.get("chapter"),
                "from": "하이라이트",
            },
            1,
        )

    # 2) 비포 선라이즈 대본에서 새로 생성한 뜻 (장면 문맥 포함)
    bsr_dir = DATA / "word-dict-bsr"
    if bsr_dir.is_dir():
        for f in sorted(bsr_dir.glob("batch-*.json")):
            for w in json.loads(f.read_text(encoding="utf-8")):
                put(
                    w["term"],
                    {
                        "ko": w["ko"],
                        "en": w.get("en"),
                        "nuance": w.get("nuance"),
                        "ctx": trim(w.get("ctx")),
                        "who": w.get("who"),
                        "ch": w.get("ch"),
                        "from": "대본",
                    },
                    2,
                )

    # 3) 노션 하이라이트 뜻풀이(단어짜리만)
    expr = {e["id"]: e for e in load("expressions.json")["expressions"]}
    for m in load("meanings.json")["meanings"]:
        e = expr.get(m["expressionId"], {})
        put(
            m["term"],
            {
                "ko": m["meaningKo"],
                "en": m.get("definitionEn"),
                "nuance": m.get("nuance"),
                "ctx": trim(e.get("context")),
                "who": e.get("speaker"),
                "ch": e.get("chapter"),
                "from": "하이라이트",
            },
            1,
        )

    # 4) 커리큘럼 유닛 어휘
    for w in load("curriculum/unit-vocab.json")["words"]:
        src = (w.get("sources") or [{}])[0]
        put(
            w["lemma"],
            {
                "ko": w["meaningKo"],
                "en": w.get("definitionEn"),
                "nuance": w.get("nuance"),
                "ctx": trim(src.get("context")),
                "who": src.get("speaker"),
                "ch": src.get("chapter"),
                "from": f"유닛 {w['unitId'].replace('u-0', '').replace('u-', '')}",
            },
            2,
        )

    # 5) 시트에 직접 적어 둔 메모
    for n in load("vocab-notes.json")["notes"]:
        put(
            n["term"],
            {
                "ko": n["gloss"],
                "en": None,
                "nuance": None,
                "ctx": trim(n.get("context")),
                "who": None,
                "ch": None,
                "from": "내 메모",
            },
            3,
        )

    # 6) B2 단어장 — 넓게 덮지만 장면 문맥이 없다
    for w in load("b2-words.json"):
        put(
            w["word"],
            {
                "ko": w.get("Meaning_KR"),
                "en": None,
                "nuance": None,
                "ctx": trim(w.get("Example")),
                "who": None,
                "ch": None,
                "from": "B2 단어장",
                "ipa": w.get("Phonetics"),
                "syn": [x for x in (w.get("Synonym_1"), w.get("Synonym_2")) if x],
            },
            4,
        )

    # ── 관련 구문 붙이기 ────────────────────────────────────────────
    # 여러 단어짜리 표현을 모아, 그 안에 들어 있는 단어에 연결한다.
    phrases = []
    for e in load("expressions.json")["expressions"]:
        if " " in e["text"].strip() and e["kind"] == "phrase":
            phrases.append(e["text"].strip())
    for w in load("curriculum/unit-vocab.json")["words"]:
        if " " in w["lemma"].strip():
            phrases.append(w["lemma"].strip())
    for n in load("vocab-notes.json")["notes"]:
        if " " in n["term"].strip():
            phrases.append(n["term"].strip())
    phrases = sorted(set(phrases))

    linked = 0
    for p in phrases:
        for tok in re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", p):
            key = tok.lower()
            if key in dict_:
                bag = dict_[key].setdefault("phr", [])
                if p not in bag and len(bag) < 5:
                    bag.append(p)
                    linked += 1

    for v in dict_.values():
        v.pop("_p", None)

    OUT.write_text(
        json.dumps(
            {
                "note": "읽기 화면 단어 팝업용. ko 뜻 · nuance 뉘앙스 · ctx 대본 문맥 · phr 관련 구문",
                "count": len(dict_),
                "words": dict(sorted(dict_.items())),
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    from collections import Counter

    dist = Counter(v["from"] for v in dict_.values())
    with_ctx = sum(1 for v in dict_.values() if v.get("ctx"))
    with_phr = sum(1 for v in dict_.values() if v.get("phr"))
    print(f"{len(dict_)}개 표제어 → {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.0f}KB)")
    print(f"  출처별: {dict(dist)}")
    print(f"  대본 문맥 있는 것 {with_ctx} · 관련 구문 붙은 것 {with_phr} (연결 {linked}건)")


if __name__ == "__main__":
    main()
