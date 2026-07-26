#!/usr/bin/env python3
"""시트에 직접 적어 둔 어휘 메모를 작은 파일로 뽑는다.

메모는 54개뿐인데, 이걸 카드로 만들려고 앱이 1MB짜리 sentences.json을
통째로 받아오고 있었다(문맥 문장을 찾기 위해서). 문맥은 여기서 미리
붙여 두면 되는 것이라, 실행할 때 큰 파일을 받을 이유가 없다.
"""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
OUT = DATA / "vocab-notes.json"

WORK_TITLES = {"disenchantment": "Disenchantment", "before-sunset": "Before Sunset"}


def main():
    src = json.loads((DATA / "sentences.json").read_text(encoding="utf-8"))
    by_id = {s["id"]: s for s in src["sentences"]}

    notes = []
    for i, v in enumerate(src["vocabNotes"], 1):
        sentence = by_id.get(v.get("sentenceId")) if v.get("sentenceId") else None
        notes.append(
            {
                "id": f"sheet-v{i:03d}",
                "term": v["term"],
                "gloss": v.get("gloss", ""),
                "context": sentence["en"] if sentence else None,
                "work": WORK_TITLES.get(v.get("work"), v.get("work")),
                "possibleTypo": v.get("possibleTypo", False),
            }
        )

    for i, v in enumerate(src["chatVocab"], 1):
        notes.append(
            {
                "id": f"chat-v{i:03d}",
                "term": v["term"],
                "gloss": v.get("gloss", ""),
                "context": v.get("example"),
                "work": "Disenchantment",
                "synonyms": v.get("synonyms", []),
            }
        )

    OUT.write_text(
        json.dumps(
            {
                "source": "구글 시트 어휘 메모 + 채팅 블록",
                "count": len(notes),
                "notes": notes,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    size = OUT.stat().st_size / 1024
    print(f"{len(notes)}개 메모 → {OUT.relative_to(ROOT)} ({size:.0f}KB)")
    print(f"  (기존에는 sentences.json {(DATA / 'sentences.json').stat().st_size / 1024 / 1024:.1f}MB를 받아왔음)")


if __name__ == "__main__":
    main()
