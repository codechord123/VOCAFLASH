#!/usr/bin/env python3
"""회화 문법 유닛을 한 파일로 합친다.

구성은 PPP다 — Present(규칙과 예문) → Practice(통제 연습) →
Produce(자기 문장 만들기). 설명만 읽고 끝나면 다음 날 아무것도 안 남고,
문제만 풀면 왜 그런지를 모른 채 답을 외운다.

연습은 전부 탭으로만 푼다. 서서 하는 공부라 타이핑이 끼면 그 자리에서
접는다 — 앱 전체의 원칙과 같다.
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "data" / "grammar"
OUT = ROOT / "src" / "data" / "grammar-course.json"

KINDS = {"choice", "order"}


def main():
    files = sorted(SRC.glob("g-*.json"))
    if not files:
        sys.exit(f"유닛 파일이 없습니다: {SRC}")

    units, problems = [], []

    for f in files:
        try:
            u = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as err:
            problems.append(f"{f.name}: JSON 파싱 실패 — {err}")
            continue

        tag = f.name
        for field in ("id", "order", "title", "goal", "why"):
            if not str(u.get(field, "")).strip():
                problems.append(f"{tag}: {field} 비어 있음")

        pres = u.get("present") or {}
        if not pres.get("rule"):
            problems.append(f"{tag}: present.rule 비어 있음")
        if len(pres.get("points") or []) < 3:
            problems.append(f"{tag}: 규칙 항목이 3개 미만")
        if len(pres.get("examples") or []) < 3:
            problems.append(f"{tag}: 예문이 3개 미만")
        for i, e in enumerate(pres.get("examples") or []):
            for field in ("en", "ko", "note"):
                if not str(e.get(field, "")).strip():
                    problems.append(f"{tag} 예문[{i}]: {field} 비어 있음")

        practice = u.get("practice") or []
        if len(practice) < 5:
            problems.append(f"{tag}: 연습이 5문항 미만")
        for i, q in enumerate(practice):
            kind = q.get("kind")
            if kind not in KINDS:
                problems.append(f"{tag} 연습[{i}]: kind '{kind}' 이상")
                continue
            if not str(q.get("why", "")).strip():
                # 왜 그 답인지 없으면 틀렸을 때 배울 것이 없다
                problems.append(f"{tag} 연습[{i}]: why 비어 있음")
            if kind == "choice":
                ch = q.get("choices") or []
                if len(ch) < 2:
                    problems.append(f"{tag} 연습[{i}]: 보기가 2개 미만")
                if q.get("answer") not in ch:
                    problems.append(f"{tag} 연습[{i}]: 정답이 보기에 없음")
                # 빈칸 없는 choice도 있다 — 오류 찾기, 뜻 대조. 문장만 있으면 된다.
                if not str(q.get("sentence", "")).strip():
                    problems.append(f"{tag} 연습[{i}]: sentence 비어 있음")
            else:
                pieces, answer = q.get("pieces") or [], q.get("answer") or []
                if sorted(pieces) != sorted(answer):
                    problems.append(f"{tag} 연습[{i}]: 조각과 정답이 다름")
                if len(pieces) < 2:
                    problems.append(f"{tag} 연습[{i}]: 조각이 2개 미만")

        # 발견 문답(선택) — 있으면 모양은 갖춰야 한다
        for i, d in enumerate(u.get("discover") or []):
            if not str(d.get("prompt", "")).strip():
                problems.append(f"{tag} 발견[{i}]: prompt 비어 있음")
            opts = d.get("options") or []
            if len(opts) < 2:
                problems.append(f"{tag} 발견[{i}]: 보기가 2개 미만")
            if not (0 <= d.get("answerIndex", -1) < len(opts)):
                problems.append(f"{tag} 발견[{i}]: answerIndex 이상")
            if not str(d.get("why", "")).strip():
                problems.append(f"{tag} 발견[{i}]: why 비어 있음")

        produce = u.get("produce") or []
        if len(produce) < 2:
            problems.append(f"{tag}: 산출 과제가 2개 미만")
        for i, p in enumerate(produce):
            for field in ("situation", "model", "ko"):
                if not str(p.get(field, "")).strip():
                    problems.append(f"{tag} 산출[{i}]: {field} 비어 있음")
            # 조각은 자기 문장을 세우는 발판이다. 모범답안만 있으면
            # 보고 외우게 된다.
            if len(p.get("chunks") or []) < 3:
                problems.append(f"{tag} 산출[{i}]: 발판 조각이 3개 미만")

        units.append(u)

    if problems:
        print(f"검증 실패 {len(problems)}건:", file=sys.stderr)
        for p in problems[:20]:
            print(f"  - {p}", file=sys.stderr)
        sys.exit(1)

    units.sort(key=lambda u: u["order"])
    OUT.write_text(
        json.dumps(
            {
                "note": "회화 문법 — Present · Practice · Produce. 전부 탭으로 푼다.",
                "count": len(units),
                "units": units,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    q = sum(len(u["practice"]) for u in units)
    pr = sum(len(u["produce"]) for u in units)
    print(f"{len(units)}유닛 → {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.0f}KB)")
    print(f"  연습 {q}문항 · 산출 과제 {pr}개")
    for u in units:
        print(f"  {u['order']}. {u['title']}")


if __name__ == "__main__":
    main()
