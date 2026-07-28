#!/usr/bin/env python3
"""관문 전용 문항을 하나로 합친다.

관문 시험이 배운 문항의 재출제면 반복될수록 '그 문제의 답'을 외우게
된다 — 전이 측정이 아니라 재인 측정이 된다. 그래서 관문은 학습 흐름에
한 번도 나오지 않는 전용 풀에서 먼저 뽑는다. 이 스크립트는 저작된
4파일을 검증해 src/data/gate-quiz.json으로 합친다.
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "data" / "gate"
OUT = ROOT / "src" / "data" / "gate-quiz.json"

FILES = {
    "grammar": ["gate-grammar-a.json", "gate-grammar-b.json"],
    "syntax": ["gate-syntax-a.json", "gate-syntax-b.json"],
}


def main():
    merged = {"grammar": {}, "syntax": {}}
    problems = []

    for kind, names in FILES.items():
        for name in names:
            path = SRC / name
            if not path.exists():
                problems.append(f"{name}: 없음")
                continue
            data = json.loads(path.read_text(encoding="utf-8"))
            for unit_id, items in data["units"].items():
                for i, q in enumerate(items):
                    tag = f"{name} {unit_id}[{i}]"
                    if kind == "grammar":
                        if not q.get("id", "").startswith("gt-"):
                            problems.append(f"{tag}: id 이상 ({q.get('id')})")
                        if q.get("kind") == "choice":
                            if q.get("answer") not in (q.get("choices") or []):
                                problems.append(f"{tag}: 정답이 보기에 없음")
                        elif q.get("kind") == "order":
                            if sorted(q.get("pieces") or []) != sorted(q.get("answer") or []):
                                problems.append(f"{tag}: 조각과 정답이 다름")
                        else:
                            problems.append(f"{tag}: kind 이상")
                        if not str(q.get("why", "")).strip():
                            problems.append(f"{tag}: why 없음")
                    else:
                        if not q.get("quizId", "").startswith("gq-"):
                            problems.append(f"{tag}: quizId 이상")
                        t = q.get("type")
                        if t == "blank" or t == "meaning":
                            if not (0 <= q.get("answerIndex", -1) < len(q.get("options") or [])):
                                problems.append(f"{tag}: answerIndex 이상")
                        elif t == "truefalse":
                            if not isinstance(q.get("isCorrect"), bool):
                                problems.append(f"{tag}: isCorrect 이상")
                        elif t in ("arrange", "koToEn"):
                            n = len(q.get("chunks") or [])
                            if sorted(q.get("answer") or []) != list(range(n)):
                                problems.append(f"{tag}: answer가 chunks 순열이 아님")
                        else:
                            problems.append(f"{tag}: type 이상 ({t})")
                        if not str(q.get("explanation", "")).strip():
                            problems.append(f"{tag}: explanation 없음")
                merged[kind].setdefault(unit_id, []).extend(items)

    if problems:
        print(f"검증 실패 {len(problems)}건:")
        for p in problems[:20]:
            print("  -", p)
        sys.exit(1)

    OUT.write_text(json.dumps(merged, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    g = sum(len(v) for v in merged["grammar"].values())
    s = sum(len(v) for v in merged["syntax"].values())
    print(f"관문 풀 → {OUT.relative_to(ROOT)} (문법 {g} · 구문 {s})")
    for kind in merged:
        for u, items in sorted(merged[kind].items()):
            print(f"  {u}: {len(items)}")


if __name__ == "__main__":
    main()
