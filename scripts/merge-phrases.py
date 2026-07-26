#!/usr/bin/env python3
"""여러 단어로 된 표현을 하나로 합친다.

for instance는 for와 instance를 따로 봐서는 뜻이 안 나오고,
I was going to say는 단어가 다 쉬운데도 묶이면 새 뉘앙스가 생긴다.
그런 자리를 읽기 화면에서 한 덩어리로 잡으려면 표가 있어야 한다.

키는 정규화한 소문자 형태다 — 화면에서 토큰을 같은 방식으로 정규화해
맞춰 보기 때문에, 여기서 어긋나면 영영 안 걸린다.
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
SRC = DATA / "word-phrases"
OUT = DATA / "word-phrases.json"

REGISTERS = {"casual", "neutral", "formal", "literary", "slang", "vulgar"}


def norm_key(phrase):
    """화면의 토큰 정규화와 같은 규칙: 소문자, 곡선 따옴표 통일,
    단어만 남기고 공백 하나로 잇는다."""
    p = (phrase or "").lower().replace("’", "'")
    words = re.findall(r"[a-z]+(?:'[a-z]+)*", p)
    return " ".join(words)


def main():
    files = sorted(SRC.glob("batch-*.json")) + sorted(SRC.glob("grammar-*.json"))
    if not files:
        sys.exit(f"구문 파일이 없습니다: {SRC}")

    table, problems, dropped = {}, [], []

    for f in files:
        # 문법 덩어리(have to, or else)는 숙어와 성격이 달라 화면에서
        # 구분해 보여준다 — 뜻보다 쓰임을 봐야 하는 것들이다.
        source = "문법" if f.name.startswith("grammar") else "구문"
        try:
            batch = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as err:
            problems.append(f"{f.name}: JSON 파싱 실패 — {err}")
            continue

        for i, p in enumerate(batch):
            tag = f"{f.name}[{i}]"
            key = norm_key(p.get("phrase"))
            n = len(key.split())

            if not key:
                problems.append(f"{tag}: phrase 비어 있음")
                continue
            if not 2 <= n <= 5:
                dropped.append(f"{p.get('phrase')} ({n}단어)")
                continue
            for field in ("ko", "en", "nuance", "register"):
                if not str(p.get(field, "")).strip():
                    problems.append(f"{tag} '{key}': {field} 비어 있음")
            if p.get("register") not in REGISTERS:
                problems.append(f"{tag} '{key}': register '{p.get('register')}' 이상")

            if key in table:
                continue  # 먼저 나온 것을 남긴다
            table[key] = {
                "ko": p["ko"],
                "en": p.get("en"),
                "nuance": p.get("nuance"),
                "ctx": p.get("ctx"),
                "who": p.get("who"),
                "ch": p.get("ch"),
                "from": source,
            }

    # 이미 가진 자료에서도 구문을 끌어온다. 본인이 표시한 것이 먼저다.
    added = 0
    expr = {e["id"]: e for e in json.loads((DATA / "expressions.json").read_text(encoding="utf-8"))["expressions"]}
    for m in json.loads((DATA / "meanings.json").read_text(encoding="utf-8"))["meanings"]:
        key = norm_key(m["term"])
        if not 2 <= len(key.split()) <= 5 or key in table:
            continue
        e = expr.get(m["expressionId"], {})
        table[key] = {
            "ko": m["meaningKo"],
            "en": m.get("definitionEn"),
            "nuance": m.get("nuance"),
            "ctx": (e.get("context") or "")[:200] or None,
            "who": e.get("speaker"),
            "ch": e.get("chapter"),
            "from": "내 하이라이트",
        }
        added += 1

    for w in json.loads((DATA / "curriculum" / "unit-vocab.json").read_text(encoding="utf-8"))["words"]:
        key = norm_key(w["lemma"])
        if not 2 <= len(key.split()) <= 5 or key in table:
            continue
        src = (w.get("sources") or [{}])[0]
        table[key] = {
            "ko": w["meaningKo"],
            "en": w.get("definitionEn"),
            "nuance": w.get("nuance"),
            "ctx": src.get("context"),
            "who": src.get("speaker"),
            "ch": src.get("chapter"),
            "from": "유닛 어휘",
        }
        added += 1

    # ── 별칭 ────────────────────────────────────────────────────────
    # 사전에는 be dead set on으로 올라가 있지만 대본에는 "I was dead set
    # on"으로 나온다. be로 시작하는 표제어는 be를 뗀 형태로도 찾을 수
    # 있어야 화면에서 걸린다.
    aliases = 0
    for key, entry in list(table.items()):
        if key.startswith("be ") and len(key.split()) > 2:
            bare = key[3:]
            if bare not in table:
                table[bare] = entry
                aliases += 1

    if problems:
        print(f"검증 실패 {len(problems)}건:", file=sys.stderr)
        for p in problems[:20]:
            print(f"  - {p}", file=sys.stderr)
        sys.exit(1)

    OUT.write_text(
        json.dumps(
            {
                "note": "읽기 화면에서 한 덩어리로 잡는 표현. 키는 정규화한 소문자.",
                "count": len(table),
                "phrases": dict(sorted(table.items())),
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    from collections import Counter

    print(f"{len(table)}개 구문 → {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.0f}KB)")
    print(f"  출처별: {dict(Counter(v['from'] for v in table.values()))}")
    print(f"  기존 자료에서 끌어온 것 {added}개 · be를 뗀 별칭 {aliases}개")
    if dropped:
        print(f"  길이가 안 맞아 뺀 것 {len(dropped)}개: {', '.join(dropped[:6])}")


if __name__ == "__main__":
    main()
