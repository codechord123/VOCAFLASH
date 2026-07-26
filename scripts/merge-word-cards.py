#!/usr/bin/env python3
"""구문 하이라이트에서 뽑아낸 단어 카드를 하나로 합친다.

노션 하이라이트 144개 중 단어 한 개짜리는 28개뿐이고 나머지 116개는
구문·문장이다. 단어 파트에 단어만 두기로 하면서, 그 116개 안에 묻혀
있던 어려운 단어를 단어 단위로 다시 뽑아냈다(생성 4배치).

병합 전에 검증한다. 생성물은 사람이 다시 읽지 않으므로:
  - term은 공백 없는 한 단어
  - 기존 단어 하이라이트 28개와 겹치지 않음, 서로도 안 겹침
  - fromExpressionId가 실제 하이라이트를 가리킴
  - 빈 문자열 금지, register는 정해진 값 중 하나
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
SRC = DATA / "word-cards"
OUT = DATA / "word-cards.json"

REGISTERS = {"casual", "neutral", "formal", "literary", "slang", "vulgar"}
REQUIRED = ("term", "meaningKo", "definitionEn", "nuance", "register", "context")


def main():
    files = sorted(SRC.glob("batch-*.json"))
    if not files:
        sys.exit(f"생성 파일이 없습니다: {SRC}")

    expressions = json.loads((DATA / "expressions.json").read_text(encoding="utf-8"))[
        "expressions"
    ]
    by_id = {e["id"]: e for e in expressions}
    existing = {
        e["text"].strip().lower() for e in expressions if not re.search(r"\s", e["text"].strip())
    }

    # 배치는 서로를 모르는 채로 돌아서 같은 단어를 뽑는 일이 생긴다
    # (nozzle이 두 하이라이트에 걸쳐 나오는 식). 중복은 실패가 아니라
    # 먼저 나온 것을 남기고 건너뛴다 — 다만 몇 개였는지는 남긴다.
    words, problems, seen, dropped = [], [], {}, []

    for f in files:
        try:
            batch = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as err:
            problems.append(f"{f.name}: JSON 파싱 실패 — {err}")
            continue
        if not isinstance(batch, list):
            problems.append(f"{f.name}: 최상위가 배열이 아님")
            continue

        for i, w in enumerate(batch):
            tag = f"{f.name}[{i}]"
            for field in REQUIRED:
                if not str(w.get(field, "")).strip():
                    problems.append(f"{tag}: {field} 비어 있음")

            term = str(w.get("term", "")).strip()
            key = term.lower()
            if re.search(r"\s", term):
                problems.append(f"{tag}: term '{term}'에 공백 — 단어 한 개여야 함")
            if key in existing:
                dropped.append(f"{term} ({tag}, 기존 단어 하이라이트와 중복)")
                continue
            if key in seen:
                dropped.append(f"{term} ({tag}, {seen[key]}와 중복)")
                continue
            if w.get("register") not in REGISTERS:
                problems.append(f"{tag}: register '{w.get('register')}' 허용값 아님")

            src_id = w.get("fromExpressionId")
            if src_id not in by_id:
                problems.append(f"{tag}: fromExpressionId '{src_id}'가 없는 하이라이트")

            seen[key] = tag
            words.append(w)

    if problems:
        print(f"검증 실패 {len(problems)}건:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        sys.exit(1)

    words.sort(key=lambda w: (w.get("chapter") or 99, w["term"].lower()))
    for i, w in enumerate(words, 1):
        w["id"] = f"bsr-w{i:03d}"

    OUT.write_text(
        json.dumps(
            {
                "work": "Before Sunrise",
                "source": "구문·문장 하이라이트에서 단어 단위로 재추출",
                "count": len(words),
                "words": words,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    from collections import Counter

    print(f"{len(words)}개 단어 → {OUT.relative_to(ROOT)}")
    print("  챕터별:", dict(sorted(Counter(w.get("chapter") for w in words).items())))
    print("  register:", dict(Counter(w["register"] for w in words)))
    if dropped:
        print(f"  중복으로 뺀 것 {len(dropped)}개: {', '.join(dropped)}")


if __name__ == "__main__":
    main()
