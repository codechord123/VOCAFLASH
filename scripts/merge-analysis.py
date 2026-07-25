#!/usr/bin/env python3
"""챕터별 해설 파일을 앱이 읽는 단일 analysis.json으로 병합한다.

생성은 챕터 단위로 나눠서 돌렸기 때문에 src/data/analysis/chapter-NN.json이
여러 개 나온다. 앱은 파일 하나만 읽으므로 여기서 합친다.

병합 전에 검증한다. 해설은 사람이 다시 읽어보지 않는 생성물이라,
형식이 깨진 채로 들어가면 화면에서야 발견된다:

  - comprehension은 정확히 5개  (노션 프롬프트 Ch5의 "5문제" 요구)
  - chunks의 en과 literal은 ' / ' 경계 수가 같아야 한다.
    직독직해는 영어 청크와 1:1로 대응해야 의미가 있다.
  - grammar.example은 스크립트에서 베낀 문장이 아니라 새로 쓴 예문
  - 빈 문자열 금지

23장은 대사가 두 줄뿐이라 chunks/grammar가 비어 있어도 통과시킨다.
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "data" / "analysis"
OUT = ROOT / "src" / "data" / "analysis.json"

# 대사가 거의 없어 chunks/grammar가 비는 것이 정상인 챕터
SPARSE_OK = {0, 23}  # Before Sunrise 기준


def check(chapter, problems):
    n = chapter["number"]
    tag = f"ch{n:02d}"

    quiz = chapter.get("comprehension", [])
    if len(quiz) != 5:
        problems.append(f"{tag}: comprehension {len(quiz)}개 (5개여야 함)")

    if n not in SPARSE_OK:
        for field in ("chunks", "grammar", "background"):
            if not chapter.get(field):
                problems.append(f"{tag}: {field} 비어 있음")

    for i, c in enumerate(chapter.get("chunks", [])):
        en_parts = c["en"].count(" / ")
        lit_parts = c["literal"].count(" / ")
        if en_parts != lit_parts:
            problems.append(
                f"{tag} chunk[{i}]: 청크 경계 불일치 (en {en_parts + 1}, literal {lit_parts + 1})"
            )
        for field in ("en", "ko", "literal"):
            if not c.get(field, "").strip():
                problems.append(f"{tag} chunk[{i}]: {field} 비어 있음")

    for i, g in enumerate(chapter.get("grammar", [])):
        for field in ("point", "explanation", "fromScript", "example"):
            if not g.get(field, "").strip():
                problems.append(f"{tag} grammar[{i}]: {field} 비어 있음")
        # 예문은 스크립트 인용이 아니라 새로 쓴 문장이어야 한다
        if g.get("example", "").strip() == g.get("fromScript", "").strip():
            problems.append(f"{tag} grammar[{i}]: example이 fromScript와 동일")

    for i, b in enumerate(chapter.get("background", [])):
        for field in ("topic", "detail"):
            if not b.get(field, "").strip():
                problems.append(f"{tag} background[{i}]: {field} 비어 있음")

    for i, q in enumerate(quiz):
        for field in ("question", "answer"):
            if not q.get(field, "").strip():
                problems.append(f"{tag} comprehension[{i}]: {field} 비어 있음")


def main():
    files = sorted(SRC.glob("chapter-*.json"))
    if not files:
        sys.exit(f"해설 파일이 없습니다: {SRC}")

    chapters, problems, seen = [], [], set()
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as err:
            problems.append(f"{f.name}: JSON 파싱 실패 — {err}")
            continue
        if data["number"] in seen:
            problems.append(f"{f.name}: 챕터 {data['number']} 중복")
            continue
        seen.add(data["number"])
        check(data, problems)
        chapters.append(data)

    chapters.sort(key=lambda c: c["number"])

    if problems:
        print(f"검증 실패 {len(problems)}건:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        sys.exit(1)

    payload = {
        "work": "Before Sunrise",
        "source": "generated",
        "chapterCount": len(chapters),
        "chapters": chapters,
    }
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    totals = {
        k: sum(len(c.get(k, [])) for c in chapters)
        for k in ("chunks", "grammar", "background", "comprehension")
    }
    print(f"{len(chapters)}개 챕터 병합 → {OUT.relative_to(ROOT)}")
    print(
        "  구문 {chunks} · 문법 {grammar} · 배경 {background} · 문제 {comprehension}".format(
            **totals
        )
    )
    missing = sorted(set(range(24)) - seen)
    if missing:
        print(f"  아직 없는 챕터: {missing}")


if __name__ == "__main__":
    main()
