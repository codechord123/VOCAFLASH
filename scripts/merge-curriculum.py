#!/usr/bin/env python3
"""유닛별 조각 파일을 앱이 읽는 커리큘럼 4파일로 합친다.

유닛 하나는 학습지(앵커·규칙·예문) · 어휘 · 퀴즈 · SRS 카드로 이루어지고,
생성은 유닛 단위로 나눠서 돌린다. 앱은 종류별로 한 파일씩 읽으므로
여기서 갈라 담는다.

병합 전에 검증한다. 퀴즈는 사람이 다시 풀어보지 않는 생성물이라,
정답 인덱스 하나가 어긋나면 학습자가 맞는 답을 틀렸다고 배운다:

  - 퀴즈 20문항, 유형별 개수(뜻5·빈칸4·OX4·배열3·한영3·앵커복원1)
  - 4지선다의 answerIndex가 options 범위 안
  - 배열/한영의 answer는 chunks 인덱스의 순열
  - relatedRuleId·srsCardId가 실재하는 규칙·카드를 가리킴
  - SRS 15장(어휘9·패턴2·함정3·앵커1), 앵커는 recitationOnly
  - 앵커 예문은 대본에 실제로 있는 문장
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
SRC = DATA / "curriculum" / "units"
OUT_DIR = DATA / "curriculum"

QUIZ_MIX = {
    "meaning": 5,
    "blank": 4,
    "truefalse": 4,
    "arrange": 3,
    "koToEn": 3,
    "anchorRestore": 1,
}
SRS_MIX = {"vocab": 9, "pattern": 2, "trap": 3, "anchor": 1}
LEVELS = {"L1", "L2", "L3", "L4"}


def norm(s):
    """대본 대조용. 따옴표·공백·구두점 차이는 무시한다."""
    return re.sub(r"[^a-z' ]", " ", (s or "").lower().replace("’", "'"))


def squeeze(s):
    return re.sub(r"\s+", " ", norm(s)).strip()


def check_unit(frag, script_text, problems):
    u = frag["unit"]
    tag = u.get("unitId", "?")

    for field in ("unitId", "act", "order", "title", "tagline"):
        if not str(u.get(field, "")).strip():
            problems.append(f"{tag}: unit.{field} 비어 있음")

    rules = u.get("rules", [])
    if not 4 <= len(rules) <= 6:
        problems.append(f"{tag}: 규칙 {len(rules)}개 (4~6개여야 함)")
    if sum(1 for r in rules if r.get("isTrap")) < 2:
        problems.append(f"{tag}: 함정 규칙이 2개 미만")
    rule_ids = {r["id"] for r in rules}

    anchors = u.get("anchors", [])
    if not anchors:
        problems.append(f"{tag}: 앵커 없음")
    for i, a in enumerate(anchors):
        for field in ("en", "ko", "chapter", "speaker", "sceneNote"):
            if not str(a.get(field, "")).strip():
                problems.append(f"{tag} anchor[{i}]: {field} 비어 있음")
        # 앵커는 대본에서 그대로 가져온 문장이어야 한다
        probe = squeeze(a.get("en", ""))[:60]
        if probe and probe not in script_text:
            problems.append(f"{tag} anchor[{i}]: 대본에 없는 문장 — {a.get('en','')[:50]}")
        if len(str(a.get("sceneNote", ""))) < 30:
            problems.append(f"{tag} anchor[{i}]: sceneNote가 너무 짧음")

    if len(u.get("generatedExamples", [])) < 3:
        problems.append(f"{tag}: 생성 예문이 3개 미만")

    # ── 어휘
    vocab = frag.get("vocab", [])
    if not 20 <= len(vocab) <= 30:
        problems.append(f"{tag}: 어휘 {len(vocab)}개 (20~30개여야 함)")
    seen = set()
    for i, w in enumerate(vocab):
        for field in ("lemma", "level", "meaningKo", "definitionEn", "nuance", "register"):
            if not str(w.get(field, "")).strip():
                problems.append(f"{tag} vocab[{i}]: {field} 비어 있음")
        if w.get("level") not in LEVELS:
            problems.append(f"{tag} vocab[{i}]: level '{w.get('level')}' 이상")
        key = str(w.get("lemma", "")).lower()
        if key in seen:
            problems.append(f"{tag} vocab[{i}]: '{key}' 중복")
        seen.add(key)
        if not w.get("sources"):
            problems.append(f"{tag} vocab[{i}]: sources 비어 있음")

    # ── SRS
    srs = frag.get("srs", [])
    kinds = {}
    for c in srs:
        kinds[c.get("kind")] = kinds.get(c.get("kind"), 0) + 1
    if kinds != SRS_MIX:
        problems.append(f"{tag}: SRS 구성 {kinds} (기대 {SRS_MIX})")
    for i, c in enumerate(srs):
        if not str(c.get("front", "")).strip():
            problems.append(f"{tag} srs[{i}]: front 비어 있음")
        if not isinstance(c.get("back"), dict):
            problems.append(f"{tag} srs[{i}]: back이 객체가 아님")
        if c.get("kind") == "anchor" and not c.get("recitationOnly"):
            problems.append(f"{tag} srs[{i}]: 앵커 카드는 recitationOnly여야 함")
    card_ids = {c["cardId"] for c in srs if c.get("cardId")}

    # ── 퀴즈
    quiz = frag.get("quiz", [])
    types = {}
    for q in quiz:
        types[q.get("type")] = types.get(q.get("type"), 0) + 1
    if types != QUIZ_MIX:
        problems.append(f"{tag}: 퀴즈 구성 {types} (기대 {QUIZ_MIX})")

    for i, q in enumerate(quiz):
        qtag = f"{tag} quiz[{i}] {q.get('quizId','')}"
        if not str(q.get("prompt", "")).strip():
            problems.append(f"{qtag}: prompt 비어 있음")

        rid = q.get("relatedRuleId")
        if rid and rid not in rule_ids:
            problems.append(f"{qtag}: relatedRuleId '{rid}' 없는 규칙")
        cid = q.get("srsCardId")
        if cid and cid not in card_ids:
            problems.append(f"{qtag}: srsCardId '{cid}' 없는 카드")

        t = q.get("type")
        if t in ("meaning", "blank"):
            opts = q.get("options", [])
            if len(opts) != 4:
                problems.append(f"{qtag}: 선택지 {len(opts)}개 (4개여야 함)")
            ai = q.get("answerIndex")
            if not isinstance(ai, int) or not 0 <= ai < len(opts):
                problems.append(f"{qtag}: answerIndex {ai} 범위 밖")
            if len(set(map(str, opts))) != len(opts):
                problems.append(f"{qtag}: 선택지 중복")
        elif t == "truefalse":
            if not isinstance(q.get("isCorrect"), bool):
                problems.append(f"{qtag}: isCorrect가 참/거짓이 아님")
            if not str(q.get("explanation", "")).strip():
                problems.append(f"{qtag}: explanation 비어 있음")
        elif t in ("arrange", "koToEn"):
            chunks = q.get("chunks", [])
            ans = q.get("answer", [])
            if not 4 <= len(chunks) <= 7:
                problems.append(f"{qtag}: 조각 {len(chunks)}개 (4~7개여야 함)")
            if sorted(ans) != list(range(len(chunks))):
                problems.append(f"{qtag}: answer가 조각 인덱스의 순열이 아님")
            for alt in q.get("altAnswers", []):
                if sorted(alt) != list(range(len(chunks))):
                    problems.append(f"{qtag}: altAnswers에 잘못된 순열")
        elif t == "anchorRestore":
            blanks = q.get("blanks", [])
            text = q.get("text", "")
            marks = sorted(re.findall(r"__(\d)__", text))
            if len(blanks) != len(marks):
                problems.append(f"{qtag}: 빈칸 표시 {len(marks)}개 vs 답 {len(blanks)}개")
            if marks != [str(i + 1) for i in range(len(blanks))]:
                problems.append(f"{qtag}: 빈칸 번호가 1..n 순서가 아님")


def main():
    files = sorted(SRC.glob("u-*.json"))
    if not files:
        sys.exit(f"유닛 조각이 없습니다: {SRC}")

    script_text = squeeze(
        " ".join(
            l["text"]
            for c in json.loads((DATA / "before-sunrise.json").read_text(encoding="utf-8"))["chapters"]
            for l in c["lines"]
        )
    )

    frags, problems = [], []
    for f in files:
        try:
            frag = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as err:
            problems.append(f"{f.name}: JSON 파싱 실패 — {err}")
            continue
        check_unit(frag, script_text, problems)
        frags.append(frag)

    if problems:
        print(f"검증 실패 {len(problems)}건:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        sys.exit(1)

    frags.sort(key=lambda f: f["unit"]["order"])

    units, vocab, quiz, srs = [], [], [], []
    for f in frags:
        u = dict(f["unit"])
        u["vocabIds"] = [w["wordId"] for w in f["vocab"]]
        units.append(u)
        vocab.extend(f["vocab"])
        quiz.extend(f["quiz"])
        srs.extend(f["srs"])

    (OUT_DIR / "units.json").write_text(
        json.dumps(
            {
                "work": "before-sunrise",
                "curriculum": "4막 13유닛",
                "note": "유닛 = 앵커 장면 + 규칙 + 배정 어휘. 퀴즈를 마치면 카드가 복습 덱에 들어간다.",
                "units": units,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / "unit-vocab.json").write_text(
        json.dumps(
            {
                "count": len(vocab),
                "levels": {"L1": "생활", "L2": "뉘앙스", "L3": "추상", "L4": "관용"},
                "words": vocab,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / "unit-quiz.json").write_text(
        json.dumps(
            {
                "count": len(quiz),
                "types": list(QUIZ_MIX),
                "quizzes": quiz,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / "unit-srs.json").write_text(
        json.dumps(
            {
                "count": len(srs),
                "note": "퀴즈 완료 후에만 덱에 투입. anchor 카드는 낭독 전용이라 SRS 박스에 넣지 않는다.",
                "cards": srs,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"{len(units)}개 유닛 병합")
    print(f"  어휘 {len(vocab)} · 퀴즈 {len(quiz)} · SRS 카드 {len(srs)}")
    missing = sorted(set(range(1, 14)) - {u["order"] for u in units})
    if missing:
        print(f"  아직 없는 유닛: {missing}")


if __name__ == "__main__":
    main()
