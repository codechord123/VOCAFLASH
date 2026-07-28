#!/usr/bin/env python3
"""영화 표현 모음집 → 카드 시드.

사용자가 올린 장르별 5파일(코미디·범죄수사·의학·시트콤·스릴러, 각 ~100개)을
하나로 합친다. 장르를 넘나들며 겹치는 표현은 첫 장르에 남기고 나머지
장르는 genres에 모은다 — 같은 표현이 다섯 번 카드가 되면 안 된다.
"""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "mid-expressions"
OUT = ROOT / "src" / "data" / "midexp.json"

GENRES = [
    ("comedy", "코미디"),
    ("sitcom", "시트콤"),
    ("crime", "범죄수사"),
    ("medical", "의학"),
    ("thriller", "스릴러"),
]


def main():
    by_phrase = {}
    order = []
    for slug, label in GENRES:
        data = json.loads((SRC / f"mid_expressions_{slug}.json").read_text(encoding="utf-8"))
        for e in data["expressions"]:
            key = e["phrase"].strip().lower()
            if key in by_phrase:
                if label not in by_phrase[key]["genres"]:
                    by_phrase[key]["genres"].append(label)
                continue
            by_phrase[key] = {
                "id": f"me-{slug}-{len([k for k in order if k[0] == slug]) + 1:03d}",
                "phrase": e["phrase"].strip(),
                "meaning": e["meaning"].strip(),
                "example": e.get("example", "").strip(),
                "translation": e.get("translation", "").strip(),
                "situation": e.get("situation", "").strip(),
                "genre": label,
                "genres": [label],
            }
            order.append((slug, key))

    items = [by_phrase[k] for _, k in order]
    OUT.write_text(
        json.dumps({"count": len(items), "expressions": items}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    from collections import Counter
    genres = Counter(i["genre"] for i in items)
    dupes = sum(1 for i in items if len(i["genres"]) > 1)
    print(f"{len(items)}개 → {OUT.relative_to(ROOT)} (장르 겹침 {dupes}개)")
    for g, n in genres.items():
        print(f"  {g}: {n}")


if __name__ == "__main__":
    main()
