#!/usr/bin/env python3
"""단어 난이도 등급을 하나로 합친다.

읽기 화면에서 단어마다 글자색을 입히려면 대본에 나오는 모든 단어의
난이도가 있어야 한다. 뜻풀이는 1,109개뿐이지만 등급은 3,000개가 넘는
단어 전부에 매길 수 있다 — 색은 '이 단어가 어려운가'만 말하면 되고,
그건 뜻을 다 적지 않아도 판단할 수 있기 때문이다.

등급이 이미 자료로 정해진 단어(유닛 어휘 L1~L4, B2 단어장)는 그 값을
우선한다. 사람이 장면을 보고 정한 등급이 일괄 생성보다 정확하다.
"""

import json
import pathlib
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
SRC = DATA / "word-levels"
OUT = DATA / "word-levels.json"

# 유닛 어휘의 L1~L4를 그대로 1~4로 쓴다.
UNIT_LEVEL = {"L1": 1, "L2": 2, "L3": 3, "L4": 4}


def main():
    files = sorted(SRC.glob("part-*.json"))
    if not files:
        sys.exit(f"등급 파일이 없습니다: {SRC}")

    levels, problems = {}, []
    for f in files:
        try:
            part = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as err:
            problems.append(f"{f.name}: JSON 파싱 실패 — {err}")
            continue
        for word, lv in part.items():
            if not isinstance(lv, int) or not 1 <= lv <= 4:
                problems.append(f"{f.name}: '{word}' 등급 {lv} (1~4여야 함)")
                continue
            key = word.strip().lower()
            if key in levels and levels[key] != lv:
                # 배치가 갈리면서 같은 단어가 두 번 나올 수 있다. 어려운
                # 쪽을 남긴다 — 색이 덜 칠해지는 것보다 낫다.
                levels[key] = max(levels[key], lv)
            else:
                levels[key] = lv

    if problems:
        print(f"검증 실패 {len(problems)}건:", file=sys.stderr)
        for p in problems[:20]:
            print(f"  - {p}", file=sys.stderr)
        sys.exit(1)

    # 사람이 정한 등급으로 덮어쓴다
    overridden = 0
    for w in json.loads((DATA / "curriculum" / "unit-vocab.json").read_text(encoding="utf-8"))["words"]:
        key = w["lemma"].strip().lower()
        if " " in key:
            continue
        lv = UNIT_LEVEL.get(w["level"])
        if lv and levels.get(key) != lv:
            levels[key] = lv
            overridden += 1

    # 본인이 하이라이트한 단어와 구문에서 뽑은 단어는 최소 3급으로 본다.
    # 읽다가 걸려서 표시한 것이라 쉬울 리가 없다.
    raised = 0
    for w in json.loads((DATA / "word-cards.json").read_text(encoding="utf-8"))["words"]:
        key = w["term"].strip().lower()
        if levels.get(key, 0) < 3:
            levels[key] = 3
            raised += 1

    OUT.write_text(
        json.dumps(
            {
                "note": "1 기초 · 2 중급 · 3 상급 · 4 고급. 읽기 화면 글자색의 근거.",
                "count": len(levels),
                "levels": dict(sorted(levels.items())),
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    dist = Counter(levels.values())
    size = OUT.stat().st_size / 1024
    print(f"{len(levels)}개 단어 → {OUT.relative_to(ROOT)} ({size:.0f}KB)")
    print(f"  등급별: {dict(sorted(dist.items()))}")
    print(f"  유닛 등급으로 교정 {overridden}개 · 하이라이트라 상향 {raised}개")


if __name__ == "__main__":
    main()
