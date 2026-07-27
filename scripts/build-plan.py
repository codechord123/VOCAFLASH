#!/usr/bin/env python3
"""100일 커리큘럼 표를 저작한다.

예전 버전은 공식이었다 — 홀수 블록 구문, 짝수 블록 문법, 챕터는 순환.
숫자는 맞지만 배움의 순서가 아니었다: 관계대명사 문법(g-07)과 관계사
구문(u-10)이 40일 떨어져 있고, 유닛을 배우는 날 읽는 챕터가 그 유닛과
무관했다.

이 표는 세 가지 원칙으로 짠다.

1) 짝짓기 — 같은 것을 다루는 구문·문법 유닛을 붙여 놓는다. 문법으로
   뼈대를 세운 직후 구문으로 그 뼈대가 대사에서 어떻게 살아 움직이는지
   본다. (질문 만들기 → 생략 의문문, 완료 시제 → 현재완료 유닛, ...)

2) 앵커 정렬 — 유닛을 배우는 날(1·2일차)의 회독 챕터는 그 유닛의 앵커
   장면이 있는 챕터다. 방금 배운 규칙을 그날 원문에서 다시 만나야
   유닛과 읽기가 한 덩어리가 된다.

3) 커버리지 — 나머지 회독 자리는 가장 덜 읽은 챕터부터 채운다.
   100일이 끝나면 24챕터 전부가 고르게 +4회독 안팎이 되어야 한다.
"""

import json
import pathlib
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
OUT = DATA / "plan-100.json"

CHAPTERS = [1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]

# ── 25유닛의 교육 순서 ──────────────────────────────────────────────
# 문법(뼈대)을 먼저, 그 뼈대를 쓰는 구문(대사)을 바로 뒤에.
# 짝이 없는 문법 유닛은 무게를 보고 사이에 끼운다 — 시제 덩어리 뒤에
# 가벼운 전치사, 총정리 앞에 가정법.
SEQUENCE = [
    # 1부 · 말 걸기 — 기차에서 말을 붙이는 데 필요한 것들
    ("g", 1),   # 지금 하는 중 vs 늘 하는 것 (모든 문장의 바닥)
    ("g", 5),   # 물어보기 — 뒤집기와 안 뒤집기
    ("u", 1),   # 생략 의문문 + 문미 부가 (방금 배운 질문이 대사에서 뭉개지는 방식)
    ("u", 2),   # 담화표지와 축약
    ("g", 4),   # 부탁할 때 세기 조절
    ("u", 3),   # 얼버무림·완충 (부드럽게 말하기 짝)
    # 2부 · 시간과 기억 — 과거를 이야기하는 법
    ("g", 2),   # 과거 vs 현재완료
    ("u", 4),   # 현재완료 경험·계속
    ("u", 5),   # 현재완료진행
    ("u", 6),   # 과거완료
    ("g", 3),   # 앞일을 말하는 세 가지
    ("u", 7),   # would의 반복 용법 (과거 습관 — 시간 덩어리의 끝)
    ("g", 12),  # in·on·at (시제 뒤의 숨 고르기)
    # 3부 · 견주고 꾸미기 — 문장을 넓히는 법
    ("g", 9),   # 견주어 말하기
    ("u", 8),   # 비교 구문
    ("g", 6),   # 관사
    ("g", 8),   # 수동태
    ("u", 9),   # 강조·도치
    ("g", 7),   # 설명을 뒤에 붙이기 (관계대명사)
    ("u", 10),  # 명사절·관계사 확장 (짝)
    ("g", 11),  # to냐 -ing냐
    ("u", 11),  # 지각동사 + -ing (짝)
    # 4부 · 가정과 후회 — 이 영화의 심장
    ("g", 10),  # 만약에 — 진짜 가정과 상상
    ("u", 12),  # 가정법 (짝)
    ("u", 13),  # wish + 과거완료 / 후회 (마지막 유닛 — 영화의 마지막 정서)
]

PHASES = [
    (1, 6, "1부 · 말 걸기"),
    (7, 13, "2부 · 시간과 기억"),
    (14, 22, "3부 · 견주고 꾸미기"),
    (23, 25, "4부 · 가정과 후회"),
]

GRAMMAR_TITLES = {
    1: "지금 하는 중 vs 늘 하는 것", 2: "언제 있었는지 말할 때 vs 말 안 할 때",
    3: "앞일을 말하는 세 가지", 4: "부탁할 때 세기 조절하기",
    5: "물어보기 — 뒤집기와 안 뒤집기", 6: "a · the · 아무것도 안 붙이기",
    7: "설명을 뒤에 붙이기", 8: "누가 했는지 말 안 할 때", 9: "견주어 말하기",
    10: "만약에 — 진짜 가정과 상상", 11: "동사 뒤에 to를 붙일까 -ing를 붙일까",
    12: "in · on · at — 시간과 자리",
}


def main():
    units = json.loads((DATA / "curriculum" / "units.json").read_text(encoding="utf-8"))["units"]
    syntax = {u["order"]: u for u in units}

    # 유닛별 앵커 챕터. 구문은 데이터에서, 문법은 예문이 거의 2장에서 와서
    # 정렬 효과가 없다 — 커버리지 채움에 맡긴다.
    anchors = {}
    for order, u in syntax.items():
        chs = sorted({a.get("chapter") for a in u.get("anchors", []) if a.get("chapter") is not None})
        # 2장은 2a(2)·2b(2.5)로 나뉘어 있다. 앵커가 2면 둘 다 후보다.
        expanded = []
        for c in chs:
            expanded.append(c)
            if c == 2:
                expanded.append(2.5)
        anchors[("u", order)] = expanded

    visits = Counter()

    def least_visited(candidates):
        """후보 중 가장 덜 읽은 챕터. 동률이면 영화 순서."""
        return min(candidates, key=lambda c: (visits[c], CHAPTERS.index(c)))

    rows = []
    for block, (kind, no) in enumerate(SEQUENCE, start=1):
        phase = next(name for lo, hi, name in PHASES if lo <= block <= hi)
        if kind == "u":
            unit = {
                "kind": "syntax",
                "id": f"u-{no:02d}",
                "no": no,
                "title": syntax[no]["title"],
            }
        else:
            unit = {"kind": "grammar", "id": f"g-{no:02d}", "no": no, "title": GRAMMAR_TITLES[no]}

        unit_anchors = anchors.get((kind, no), [])
        for step in range(1, 5):
            # 배우는 날(1·2일)은 앵커 챕터를 읽는다. 나머지는 덜 읽은 곳.
            if step <= 2 and unit_anchors:
                ch = least_visited(unit_anchors)
            else:
                ch = least_visited(CHAPTERS)
            visits[ch] += 1
            rows.append(
                {
                    "day": (block - 1) * 4 + step,
                    "block": block,
                    "step": step,
                    "phase": phase,
                    "unit": unit,
                    "chapter": ch,
                }
            )

    OUT.write_text(
        json.dumps(
            {
                "note": "100일 커리큘럼. 짝짓기·앵커 정렬·커버리지 세 원칙으로 저작.",
                "days": rows,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"100일 → {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f}KB)")
    print(f"  회독 배분: 최소 {min(visits.values())} · 최대 {max(visits.values())} · 챕터 {len(visits)}개")
    aligned = sum(1 for r in rows if r["step"] <= 2 and r["unit"]["kind"] == "syntax")
    print(f"  앵커 정렬된 날: {aligned}일 (구문 유닛의 배우는 날)")
    for lo, hi, name in PHASES:
        days = [r for r in rows if lo <= r["block"] <= hi]
        print(f"  {name}: {days[0]['day']}–{days[-1]['day']}일")


if __name__ == "__main__":
    main()
