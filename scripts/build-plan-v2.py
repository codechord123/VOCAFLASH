#!/usr/bin/env python3
"""100일 표 v2 — 10일 사이클 열 개.

v1은 유닛당 4일 연속 블록의 나열이었다. 배우는 동안은 괜찮지만 블록이
끝나면 그 유닛은 영영 돌아오지 않았고(누적 복습은 유닛 SRS가 따로 해결),
시험도 유창성 훈련도 없었다. 학습과학이 말하는 좋은 커리큘럼의 뼈대 —
간격·교차·시험 효과·유창성 가닥 — 를 표 자체에 넣는다.

한 사이클(10일)의 모양:
  앞 6일   신규 유닛 2~3개 — 유닛당 2일(배우기→되짚기),
           2유닛 사이클은 3일째(내 것으로)까지
  7일차    관문 시험 — 지금까지 배운 전 범위에서 교차 출제, 힌트 없음
  8일차    유창성 — 새것 없음. 앵커 암송과 이미 읽은 챕터 재독
  9일차    산출 — 사이클의 문법 과제·구문 앵커를 입으로
  10일차   마일스톤 — 약점 되잡기와 사이클 정리

유닛 배분 [3,3,3,2,2,3,3,3,2,1] = 25유닛. 부(phase) 경계와 맞아떨어지고,
마지막 사이클은 u-13(wish/후회 — 영화의 마지막 정서) 하나에 총정리를
넉넉히 두는 피날레다.

회독 원칙은 v1을 잇는다: 배우는 날은 앵커 챕터, 유창성 날은 그 사이클에서
이미 읽은 챕터를 다시(재독이 유창성 훈련이다), 나머지는 덜 읽은 챕터부터.
"""

import json
import pathlib
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
OUT = DATA / "plan-100.json"

CHAPTERS = [1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]

# v1과 같은 교육 순서 — 짝짓기(문법 뼈대 → 구문 적용)는 그대로 살린다.
SEQUENCE = [
    ("g", 1), ("g", 5), ("u", 1),            # C1  1부 · 말 걸기
    ("u", 2), ("g", 4), ("u", 3),            # C2
    ("g", 2), ("u", 4), ("u", 5),            # C3  2부 · 시간과 기억
    ("u", 6), ("g", 3),                      # C4
    ("u", 7), ("g", 12),                     # C5
    ("g", 9), ("u", 8), ("g", 6),            # C6  3부 · 견주고 꾸미기
    ("g", 8), ("u", 9), ("g", 7),            # C7
    ("u", 10), ("g", 11), ("u", 11),         # C8
    ("g", 10), ("u", 12),                    # C9  4부 · 가정과 후회
    ("u", 13),                               # C10 피날레
]

CYCLE_SIZES = [3, 3, 3, 2, 2, 3, 3, 3, 2, 1]

CYCLE_PHASES = {
    1: "1부 · 말 걸기", 2: "1부 · 말 걸기",
    3: "2부 · 시간과 기억", 4: "2부 · 시간과 기억", 5: "2부 · 시간과 기억",
    6: "3부 · 견주고 꾸미기", 7: "3부 · 견주고 꾸미기", 8: "3부 · 견주고 꾸미기",
    9: "4부 · 가정과 후회", 10: "4부 · 가정과 후회",
}

GRAMMAR_TITLES = {
    1: "지금 하는 중 vs 늘 하는 것", 2: "언제 있었는지 말할 때 vs 말 안 할 때",
    3: "앞일을 말하는 세 가지", 4: "부탁할 때 세기 조절하기",
    5: "물어보기 — 뒤집기와 안 뒤집기", 6: "a · the · 아무것도 안 붙이기",
    7: "설명을 뒤에 붙이기", 8: "누가 했는지 말 안 할 때", 9: "견주어 말하기",
    10: "만약에 — 진짜 가정과 상상", 11: "동사 뒤에 to를 붙일까 -ing를 붙일까",
    12: "in · on · at — 시간과 자리",
}


def unit_ref(kind, no, syntax):
    if kind == "u":
        return {"kind": "syntax", "id": f"u-{no:02d}", "no": no, "title": syntax[no]["title"]}
    return {"kind": "grammar", "id": f"g-{no:02d}", "no": no, "title": GRAMMAR_TITLES[no]}


def main():
    units = json.loads((DATA / "curriculum" / "units.json").read_text(encoding="utf-8"))["units"]
    syntax = {u["order"]: u for u in units}

    anchors = {}
    for order, u in syntax.items():
        chs = sorted({a.get("chapter") for a in u.get("anchors", []) if a.get("chapter") is not None})
        expanded = []
        for c in chs:
            expanded.append(c)
            if c == 2:
                expanded.append(2.5)
        anchors[("u", order)] = expanded

    visits = Counter()

    def least_visited(candidates):
        return min(candidates, key=lambda c: (visits[c], CHAPTERS.index(c)))

    # 사이클별 유닛 묶기
    cycles = []
    idx = 0
    for size in CYCLE_SIZES:
        cycles.append(SEQUENCE[idx : idx + size])
        idx += size
    assert idx == len(SEQUENCE) == 25

    rows = []
    day = 0

    def push(kind, cycle_no, day_in_cycle, unit=None, step=None, graduates=False, chapter=None):
        nonlocal day
        day += 1
        ch = chapter if chapter is not None else least_visited(CHAPTERS)
        visits[ch] += 1
        row = {
            "day": day,
            "cycle": cycle_no,
            "dayInCycle": day_in_cycle,
            "kind": kind,
            "phase": CYCLE_PHASES[cycle_no],
            "chapter": ch,
        }
        if unit is not None:
            row["unit"] = unit
            row["step"] = step
            if graduates:
                row["graduates"] = True
        rows.append(row)
        return ch

    for c_no, cycle_units in enumerate(cycles, start=1):
        d = 0
        steps_per_unit = {3: 2, 2: 3, 1: 3}[len(cycle_units)]
        cycle_read = []  # 이 사이클에서 배우는 날 읽은 챕터들 — 유창성 재독 후보
        cycle_unit_refs = [unit_ref(k, n, syntax) for k, n in cycle_units]

        for (kind, no), ref in zip(cycle_units, cycle_unit_refs):
            unit_anchor = anchors.get((kind, no), [])
            for step in range(1, steps_per_unit + 1):
                d += 1
                # 배우는 이틀은 앵커 챕터 — 방금 배운 규칙을 원문에서 만난다
                ch = least_visited(unit_anchor) if step <= 2 and unit_anchor else None
                ch = push("learn", c_no, d, unit=ref, step=step,
                          graduates=(step == steps_per_unit), chapter=ch)
                cycle_read.append(ch)

        # 피날레 사이클은 유닛이 하나라 자리가 남는다 — 총정리를 넉넉히
        if len(cycle_units) == 1:
            d += 1; push("fluency", c_no, d, chapter=cycle_read[0])
            d += 1; push("produce", c_no, d)
            d += 1; push("test", c_no, d)

        d += 1; push("test", c_no, d)
        # 유창성 날은 새 챕터가 아니라 이 사이클에서 읽은 챕터의 재독
        d += 1; push("fluency", c_no, d, chapter=cycle_read[0])
        d += 1; push("produce", c_no, d)
        d += 1; push("milestone", c_no, d)
        assert d == 10, f"cycle {c_no} has {d} days"

    assert day == 100, f"total {day} days"

    OUT.write_text(
        json.dumps(
            {
                "note": "100일 표 v2 — 10일 사이클(신규 6일 + 관문·유창성·산출·마일스톤). build-plan-v2.py가 저작.",
                "days": rows,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    kinds = Counter(r["kind"] for r in rows)
    print(f"100일 v2 → {OUT.relative_to(ROOT)}")
    print(f"  날 종류: {dict(kinds)}")
    print(f"  회독 배분: 최소 {min(visits.values())} · 최대 {max(visits.values())} · 챕터 {len(visits)}개")
    grads = [r for r in rows if r.get("graduates")]
    print(f"  졸업(궤도 진입) 날: {len(grads)}개 유닛")
    for c in range(1, 11):
        cr = [r for r in rows if r["cycle"] == c]
        us = []
        for r in cr:
            if r["kind"] == "learn" and r["unit"]["id"] not in us:
                us.append(r["unit"]["id"])
        print(f"  C{c}: {cr[0]['day']}–{cr[-1]['day']}일 · {'+'.join(us)}")


if __name__ == "__main__":
    main()
