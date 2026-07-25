#!/usr/bin/env python3
"""시트에서 나온 문장 행을 '읽을 수 있는 스크립트'로 재구성한다.

sentences.json은 자막 한 줄이 곧 한 행이다. 읽기용으로는 그대로 쓸 수 없다:

  - 26.6%가 문장 중간에 끊긴 조각이다. 자막은 화면에 두 줄씩 띄우려고
    문장을 쪼개 놓기 때문이다. `continuesPrevious`가 붙은 행은 앞 행에
    이어붙여야 한 문장이 된다.
  - 한국어 쪽에는 `koSupersededByNext`가 있다. 앞 행의 한국어가 다음 행
    한국어의 앞부분과 겹치는 자막 블록 현상이라, 겹치는 쪽을 버린다.
  - 화자 이름이 영어 안에 `[Bean]`, `WOMAN:` 형태로 섞여 있던 것은
    파서가 이미 `speaker`로 빼놨다.

섹션은 원래 시트의 표 경계다. Disenchantment는 8개 표가 에피소드 묶음
순서대로 이어져 있어 그대로 챕터가 된다.
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "data" / "sentences.json"
OUT = ROOT / "src" / "data" / "sheet-scripts.json"

# 시트 섹션 → 읽기용 챕터 제목. 섹션 경계가 곧 장면 묶음이다.
SECTION_TITLES = {
    1: "1. 벤트우드의 결혼식",
    2: "2. 평화의 고원",
    3: "3. 루시와의 계약",
    4: "4. 비밀 결사",
    5: "5. 수녀원",
    6: "6. 수확제와 댕크마이어 대사",
    7: "7. 역병 순찰",
    8: "8. 조그와 불멸의 영약",
    9: "Before Sunset",
}

WORK_META = {
    "disenchantment": {
        "title": "Disenchantment",
        "subtitle": "넷플릭스 애니메이션 · 시즌 1",
        "kind": "series",
    },
    "before-sunset": {
        "title": "Before Sunset",
        "subtitle": "2004 · 비포 3부작 2편",
        "kind": "film",
    },
}


# 한 장의 상한과 목표 길이. 90줄이면 스크롤로 훑을 만하다.
CHAPTER_MAX = 150
CHAPTER_TARGET = 90


def split_long(lines, target):
    """긴 장을 목표 길이 근처에서 자른다. 화자가 바뀌는 줄에서만 끊는다."""
    parts, cur = [], []
    for line in lines:
        # 목표를 넘겼고 새 화자가 시작하는 줄이면 여기서 끊는다.
        if len(cur) >= target and line.get("speaker"):
            parts.append(cur)
            cur = []
        cur.append(line)
    if cur:
        # 마지막 조각이 너무 짧으면 앞 장에 붙인다.
        if parts and len(cur) < target // 3:
            parts[-1].extend(cur)
        else:
            parts.append(cur)
    return parts


def join_lines(rows):
    """조각난 자막 행을 문장 단위로 합친다."""
    out = []
    for row in rows:
        en = (row.get("en") or "").strip()
        ko = (row.get("ko") or "").strip()
        if not en:
            continue

        # 앞 행이 문장 중간에 끊겼고 이 행이 그 continuation이면 이어붙인다.
        if out and row.get("continuesPrevious") and not row.get("speaker"):
            prev = out[-1]
            prev["en"] = f"{prev['en']} {en}".strip()
            if ko:
                prev["ko"] = f"{prev['ko']} {ko}".strip()
            prev["merged"] = prev.get("merged", 1) + 1
            continue

        # 한국어가 다음 행에 흡수되는 자막 블록이면 한국어를 비워 둔다.
        # (영어는 살린다 — 겹치는 건 번역 쪽뿐이다.)
        line = {"en": en, "ko": "" if row.get("koSupersededByNext") else ko}
        if row.get("speaker"):
            line["speaker"] = row["speaker"]
        if row.get("koFluent"):
            line["koFluent"] = row["koFluent"]
        if row.get("isLyric"):
            line["lyric"] = True
        out.append(line)
    return out


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    rows = [s for s in data["sentences"] if not s.get("truncated")]

    works = []
    for work_id, meta in WORK_META.items():
        work_rows = [r for r in rows if r["work"] == work_id]
        if not work_rows:
            continue

        sections = sorted({r["section"] for r in work_rows})
        chapters = []
        for sec in sections:
            sec_rows = [r for r in work_rows if r["section"] == sec]
            sec_rows.sort(key=lambda r: r["sourceLine"])
            lines = join_lines(sec_rows)
            if not lines:
                continue

            base = SECTION_TITLES.get(sec, f"{sec}부")
            # Before Sunset은 시트에 표 하나로 들어 있어 700줄짜리 한 장이
            # 된다. 한 화면에 700줄은 읽지 못하니 읽을 만한 크기로 자른다.
            # 대화가 끊기지 않는 영화라 자연스러운 경계가 없어, 화자가
            # 바뀌는 지점에서 끊어 대사 중간을 가르지 않게 한다.
            if len(lines) > CHAPTER_MAX:
                parts = split_long(lines, CHAPTER_TARGET)
                for j, chunk in enumerate(parts, start=1):
                    chapters.append(
                        {
                            "number": len(chapters) + 1,
                            "section": sec,
                            "title": f"{base} — {j}/{len(parts)}",
                            "lineCount": len(chunk),
                            "lines": chunk,
                        }
                    )
            else:
                chapters.append(
                    {
                        "number": len(chapters) + 1,
                        "section": sec,
                        "title": base,
                        "lineCount": len(lines),
                        "lines": lines,
                    }
                )

        works.append(
            {
                "id": work_id,
                **meta,
                "chapterCount": len(chapters),
                "lineCount": sum(c["lineCount"] for c in chapters),
                "chapters": chapters,
            }
        )

    OUT.write_text(
        json.dumps({"works": works}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    for w in works:
        merged = sum(
            l.get("merged", 1) - 1 for c in w["chapters"] for l in c["lines"]
        )
        print(
            f"{w['title']}: {w['chapterCount']}장 · {w['lineCount']}줄 "
            f"(조각 {merged}개 이어붙임)"
        )
    print(f"→ {OUT.relative_to(ROOT)}")

    if not works:
        sys.exit("작품을 하나도 만들지 못했습니다.")


if __name__ == "__main__":
    main()
