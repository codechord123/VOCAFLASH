#!/usr/bin/env python3
"""고쳐 쓴 번역과 새 챕터 구조를 sheet-scripts.json에 반영한다.

시트에서 나온 한국어는 넷플릭스 자막에 기계번역을 덧씌운 것이라 세 가지가
망가져 있었다:

  - 줄 밀림. 한 줄의 한국어에 앞줄 내용이 섞여 들어오고 같은 구절이
    반복된다. 학습 도구에서 이게 가장 나쁘다 — 한 문장을 확인하려는데
    다른 문장의 번역을 보게 된다.
  - 화면 자막 텍스트 혼입. 포스터 글자가 대사에 붙어 있었다.
  - 오역과 과잉 순화. 중세 배경의 mace가 최루 스프레이가 되고,
    욕설을 완곡하게 바꿔서 농담이 사라졌다.

Before Sunset은 번역만이 아니라 챕터 구조 자체를 다시 만들었다. 시트에
표 하나로 들어 있어서 698줄이 통째로 한 장이었는데, Before Sunrise처럼
장면 단위로 나누고 제목을 붙였다.

입력: src/data/fixed/
  before-sunset.json        — 챕터 구조까지 교체
  disenchantment-NN.json    — 챕터별 번역 교체 (index로 대응)
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGET = ROOT / "src" / "data" / "sheet-scripts.json"
FIXED = ROOT / "src" / "data" / "fixed"


def main():
    if not FIXED.is_dir():
        sys.exit(f"수정 파일 디렉터리가 없습니다: {FIXED}")

    data = json.loads(TARGET.read_text(encoding="utf-8"))
    works = {w["id"]: w for w in data["works"]}
    problems = []
    report = []

    # ── Before Sunset: 챕터 구조 전체 교체 ──────────────────────────
    bs_path = FIXED / "before-sunset.json"
    if bs_path.is_file():
        fixed = json.loads(bs_path.read_text(encoding="utf-8"))
        old = works.get("before-sunset")
        if old is None:
            problems.append("before-sunset이 대상 파일에 없습니다")
        else:
            old_lines = [l["en"] for c in old["chapters"] for l in c["lines"]]
            new_lines = [l["en"] for c in fixed["chapters"] for l in c["lines"]]
            if old_lines != new_lines:
                problems.append(
                    f"before-sunset 대사가 바뀌었습니다 "
                    f"(원본 {len(old_lines)}줄 → 수정 {len(new_lines)}줄)"
                )
            empty = sum(
                1 for c in fixed["chapters"] for l in c["lines"] if not l["ko"].strip()
            )
            if empty:
                problems.append(f"before-sunset 빈 번역 {empty}개")

            for c in fixed["chapters"]:
                c["lineCount"] = len(c["lines"])
            works["before-sunset"] = {
                **old,
                "title": fixed["title"],
                "subtitle": fixed["subtitle"],
                "kind": fixed["kind"],
                "chapters": fixed["chapters"],
                "chapterCount": len(fixed["chapters"]),
                "lineCount": sum(c["lineCount"] for c in fixed["chapters"]),
            }
            report.append(
                f"Before Sunset: {len(fixed['chapters'])}장으로 재구성 "
                f"({len(new_lines)}줄, 번역 전면 교체)"
            )

    # ── Disenchantment: 챕터별 번역 교체 ────────────────────────────
    dis = works.get("disenchantment")
    dis_files = sorted(FIXED.glob("disenchantment-*.json"))
    replaced = 0
    if dis_files and dis is None:
        problems.append("disenchantment가 대상 파일에 없습니다")
    elif dis_files:
        by_number = {c["number"]: c for c in dis["chapters"]}
        for f in dis_files:
            fixed = json.loads(f.read_text(encoding="utf-8"))
            chapter = by_number.get(fixed["number"])
            if chapter is None:
                problems.append(f"{f.name}: {fixed['number']}장이 없습니다")
                continue

            want = list(range(len(chapter["lines"])))
            got = [l["index"] for l in fixed["lines"]]
            if got != want:
                problems.append(
                    f"{f.name}: index가 어긋납니다 "
                    f"(원본 {len(want)}줄, 수정 {len(got)}줄)"
                )
                continue

            for entry in fixed["lines"]:
                line = chapter["lines"][entry["index"]]
                # 영어가 다르면 잘못된 줄에 번역을 붙이는 것이다. 이걸
                # 놓치면 밀림 문제를 고치면서 새 밀림을 만든다.
                if line["en"] != entry["en"]:
                    problems.append(
                        f"{f.name}[{entry['index']}]: 영어가 일치하지 않습니다"
                    )
                    continue
                if not entry["ko"].strip():
                    problems.append(f"{f.name}[{entry['index']}]: 번역이 비었습니다")
                    continue
                line["ko"] = entry["ko"]
                # 기계번역 잔재는 지운다 — 새 번역이 유일한 답이다.
                line.pop("koFluent", None)
                replaced += 1
        if replaced:
            report.append(f"Disenchantment: {replaced}줄 번역 교체")

    if problems:
        print(f"검증 실패 {len(problems)}건 — 아무것도 반영하지 않았습니다:", file=sys.stderr)
        for p in problems[:20]:
            print(f"  - {p}", file=sys.stderr)
        if len(problems) > 20:
            print(f"  … 외 {len(problems) - 20}건", file=sys.stderr)
        sys.exit(1)

    data["works"] = list(works.values())
    TARGET.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    for line in report:
        print(line)
    print(f"→ {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
