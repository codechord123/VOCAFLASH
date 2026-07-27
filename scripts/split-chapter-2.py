#!/usr/bin/env python3
"""비포 선라이즈 2장을 장면이 바뀌는 자리에서 둘로 나눈다.

2장은 83줄로 한 화면에 담기에 너무 길다. 마침 대본 안에 끊을 자리가
적혀 있다 — "Scene fades, then returns to lounge car an unknown amount
of time later". 우리가 임의로 자르는 것이 아니라 대본이 이미 끊어 둔
자리를 쓰는 것이다.

두 가지를 지킨다.

1) 번호를 다시 매기지 않는다. 회독·퀴즈 기록·담은 문장이 전부 챕터
   번호로 저장돼 있어서, 3장 이후를 한 칸씩 밀면 그 기록들이 엉뚱한
   챕터에 붙는다. 새 부분은 2.5번을 받는다.

2) 옮겨 간 줄의 id를 그대로 둔다. 담은 문장의 id는 '챕터-줄번호'인데,
   뒤쪽 19줄이 새 챕터의 0~18번이 되면 이미 담아 둔 문장이 전부
   길을 잃는다. 새 챕터에 idBase(원래 챕터·시작 위치)를 적어 두고
   화면에서 그것으로 id를 만든다.
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"

SPLIT_AT = 64  # "Scene fades, then returns to lounge car..." 지시문의 위치
NEW_NUMBER = 2.5


def norm(s):
    return re.sub(r"[^a-z' ]", " ", (s or "").lower()).split()


def in_text(needle, blob):
    """needle의 단어들이 blob 안에 이어서 나오는가. 대본 표기가 조금씩
    달라 통짜 비교는 자주 빗나간다."""
    n = " ".join(norm(needle))
    return bool(n) and n in blob


def main():
    script_path = DATA / "before-sunrise.json"
    script = json.loads(script_path.read_text(encoding="utf-8"))
    chapters = script["chapters"]

    idx = next(i for i, c in enumerate(chapters) if c["number"] == 2)
    ch = chapters[idx]

    if any(c["number"] == NEW_NUMBER for c in chapters):
        sys.exit("이미 나뉘어 있습니다.")

    marker = ch["lines"][SPLIT_AT]
    if "Scene fades" not in (marker.get("text") or ""):
        sys.exit(f"{SPLIT_AT}번 줄이 장면 전환 지시문이 아닙니다: {marker}")

    head, tail = ch["lines"][:SPLIT_AT], ch["lines"][SPLIT_AT:]
    head_blob = " ".join(" ".join(norm(l.get("text"))) for l in head)
    tail_blob = " ".join(" ".join(norm(l.get("text"))) for l in tail)

    # 하이라이트도 갈라 준다. 어느 쪽에도 안 걸리면 앞부분에 남긴다 —
    # 잃는 것보다 낫다.
    head_h, tail_h = [], []
    for h in ch.get("highlights", []):
        probe = h.get("context") or h.get("text")
        (tail_h if in_text(probe, tail_blob) and not in_text(probe, head_blob) else head_h).append(h)

    part_b = {
        "number": NEW_NUMBER,
        "title": "Chapter 2b : Never spoken of the possibility - the Lounge Car, later",
        "notionId": ch.get("notionId"),
        "locationNote": "2장 후반 — 장면이 한 번 어두워졌다가 다시 라운지 칸으로 돌아온다",
        # 옮겨 온 줄의 id는 원래 자리로 만든다. 담아 둔 문장을 지키는 장치다.
        "idBase": {"chapter": 2, "offset": SPLIT_AT},
        "lines": tail,
        "highlights": tail_h,
    }

    ch["title"] = "Chapter 2a : You're American? Are you sure? - the Lounge Car"
    ch["lines"] = head
    ch["highlights"] = head_h

    chapters.insert(idx + 1, part_b)
    script_path.write_text(
        json.dumps(script, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )

    # ── 해설도 같이 나눈다 ──────────────────────────────────────────
    # 나눠 놓고 해설을 그대로 두면 뒷부분에서 '해설' 표시가 사라진다.
    an_path = DATA / "analysis.json"
    an = json.loads(an_path.read_text(encoding="utf-8"))
    a_idx = next(i for i, c in enumerate(an["chapters"]) if c["number"] == 2)
    a = an["chapters"][a_idx]

    def split_by(items, text_of):
        h, t = [], []
        for it in items:
            probe = text_of(it)
            (t if in_text(probe, tail_blob) and not in_text(probe, head_blob) else h).append(it)
        return h, t

    # 구문 정리는 조각 단위로 본다. 한 항목이 여러 문장을 묶고 있어서,
    # 그중 하나라도 뒷부분 것이면 뒤로 보낸다.
    def chunk_side(c):
        parts = [p.strip() for p in c["en"].split("/") if p.strip()]
        return any(in_text(p, tail_blob) for p in parts) and not any(
            in_text(p, head_blob) for p in parts
        )

    chunks_h = [c for c in a["chunks"] if not chunk_side(c)]
    chunks_t = [c for c in a["chunks"] if chunk_side(c)]
    gram_h, gram_t = split_by(a["grammar"], lambda g: (g.get("fromScript") or "").split("/")[0])

    a["chunks"], a["grammar"] = chunks_h, gram_h
    an["chapters"].insert(
        a_idx + 1,
        {
            "number": NEW_NUMBER,
            "title": part_b["title"],
            "chunks": chunks_t,
            "grammar": gram_t,
            # 배경지식은 장면이 아니라 작품·시대에 대한 것이라 나누지
            # 않는다. 앞부분에 그대로 둔다.
            "background": [],
            "comprehension": [],
        },
    )
    an_path.write_text(json.dumps(an, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"2장을 나눴습니다 — 앞 {len(head)}줄 / 뒤 {len(tail)}줄")
    print(f"  하이라이트  앞 {len(head_h)} / 뒤 {len(tail_h)}")
    print(f"  구문 정리   앞 {len(chunks_h)} / 뒤 {len(chunks_t)}")
    print(f"  문법        앞 {len(gram_h)} / 뒤 {len(gram_t)}")
    print(f"  옮겨 간 줄의 id는 c2-l{SPLIT_AT}부터 그대로 유지됩니다")


if __name__ == "__main__":
    main()
