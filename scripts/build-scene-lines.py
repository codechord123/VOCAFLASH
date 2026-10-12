#!/usr/bin/env python3
"""수업 첫 장면(콜드 오픈) 후보를 챕터마다 뽑는다.

콜드 오픈은 구문 유닛의 앵커 대사에서 골랐는데, 앵커가 없는 챕터가 11개라
100일 중 40일은 첫 장면 없이 시작했다. 그 챕터들은 해설 자료(구문 정리)의
덩어리에서 고른다 — 영어와 한국어가 함께 있고, 이미 앱 안에 있는 문장이다.

고르는 기준: 5~22단어, 대사 한 줄로 읽히는 것. 챕터마다 3개까지 —
같은 챕터를 읽는 날이 여러 번이라 날마다 다른 줄이 나오게.
"""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
OUT = DATA / "scene-lines.json"


def clean(en):
    return " ".join(en.replace(" / ", " ").replace("/", " ").split())


def main():
    units = json.loads((DATA / "curriculum" / "units.json").read_text(encoding="utf-8"))["units"]
    anchored = {a.get("chapter") for u in units for a in u.get("anchors", []) if a.get("chapter") is not None}
    analysis = json.loads((DATA / "analysis.json").read_text(encoding="utf-8"))["chapters"]

    out = {}
    for ch in analysis:
        num = ch["number"]
        try:
            base = int(float(num))
        except ValueError:
            continue
        if base in anchored:
            continue
        picks = []
        for c in ch.get("chunks", []):
            en = clean(c.get("en", ""))
            n = len(en.split())
            if 5 <= n <= 22 and c.get("ko"):
                picks.append({"en": en, "ko": c["ko"], "speaker": None, "chapter": base})
        # 길이가 중간쯤인 것부터 — 너무 짧으면 장면이 안 되고, 길면 한 화면을 넘긴다
        picks.sort(key=lambda p: abs(len(p["en"].split()) - 12))
        if picks:
            out[str(base)] = picks[:3]

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"장면 후보 → {OUT.relative_to(ROOT)}: 챕터 {len(out)}개 — {sorted(out, key=int)}")


if __name__ == "__main__":
    main()
