# 비포 선라이즈 데이터베이스 설명서

다른 곳에서 기획 회의를 할 때 그대로 붙여 넣어 쓰는 문서입니다.
앱(VOCAFLASH 저장소)에 이미 들어 있는 비포 선라이즈 관련 데이터가 무엇이고,
어떤 구조이며, 무엇이 없는지를 정리했습니다.

---

## 1. 한눈에 보기

비포 선라이즈 데이터는 4개 파일로 나뉩니다. 전부 정적 JSON이고, 이미 생성이
끝나 앱에 포함되어 있습니다 (추가 생성 비용 0).

| 파일 | 내용 | 규모 |
|---|---|---|
| `before-sunrise.json` | 대본 전문 (챕터·대사·지문) | 24챕터 · 906줄 |
| `expressions.json` | 노션에서 학습자가 하이라이트한 표현 (정제본) | 144개 |
| `meanings.json` | 위 하이라이트 144개 전부의 뜻·뉘앙스 해설 | 144개 |
| `analysis.json` | 챕터별 구문 분석·문법·배경지식·이해도 문제 | 23챕터 분석 |

관계: `expressions`의 각 항목은 대본의 특정 챕터·대사에서 나왔고(`chapter`,
`context` 필드로 연결), `meanings`는 `expressionId`로 `expressions`와 1:1
연결됩니다. `analysis`는 대본 챕터 번호로 연결됩니다.

출처: 대본과 하이라이트는 사용자의 노션 "Before Sunrise 프로젝트"(챕터별
페이지)에서 추출·정제. 분석 4종은 Claude가 이번 프로젝트에서 새로 생성.

---

## 2. `before-sunrise.json` — 대본 전문

```
{ work, sourceDatabase, extractedChapters: 24, chapters: [ ... ] }
```

챕터 하나:

```json
{
  "number": 2,
  "title": "Chatper 2 : You're American? Are you sure? - the Lounge Car",
  "notionId": "...",
  "locationNote": "기차 라운지 칸. 두 사람이 처음 마주 앉아 대화하는 곳",
  "lines": [
    { "type": "dialogue", "speaker": "Céline",
      "text": "Then I spent some time in London. How do you speak such good English?" },
    { "type": "direction", "speaker": null, "text": "(Points to table)" }
  ],
  "highlights": [ ...이 챕터의 하이라이트 원본... ]
}
```

- **줄(line) 타입**: `dialogue` 782줄 · `direction`(지문) 75줄 · `note`(노션 메모) 49줄
- **화자**: Jesse 368줄, Céline 356줄, 조연(Man with tie, Poet, Gypsy 등) 소수
- **챕터 크기 편차가 큼**: 최소 2줄(23장 엔딩) ~ 최대 108줄(12장 시인).
  챕터별 줄 수: 1장 23 · 2장 83 · 3장 23 · 4장 61 · 5장 67 · 6장 26 · 7장 27 ·
  8장 38 · 9장 41 · 10장 5 · 11장 21 · 12장 108 · 13장 73 · 14장 57 · 15장 52 ·
  16장 11 · 17장 31 · 18장 22 · 19장 30 · 20장 29 · 21장 24 · 22장 52 · 23장 2
- **Chapter 0은 빈 껍데기**: "모든 문법 및 표현 정리"라는 제목만 있고 줄이 0개.
  노션에서도 비어 있던 페이지. 무시하면 됨.
- 챕터 제목은 노션 원문 그대로라 오타 포함 (Chatper, viennna 등).

---

## 3. `expressions.json` — 학습자 하이라이트 144개

노션 원문에서 색칠된 부분을 추출해 중복 병합·정리한 것 (원본 179 → 144).

```json
{
  "id": "bsr-h001",
  "text": "nullify",
  "kind": "word",
  "color": "orange",
  "chapter": 1,
  "chapterTitle": "Chapter 1 : what are you reading? -the train",
  "context": "I guess they sort of nullify each other, or something.",
  "speaker": "Céline",
  "mergedFrom": 1,
  "origin": "learner-highlight"
}
```

- **kind 분포**: phrase 83 · sentence 33 · word 28 — 즉 **단어 하나짜리는 28개뿐**,
  대부분 구문/문장 단위 표시임.
- **챕터 분포가 심하게 쏠림**: 2장 49개, 8장 17개에 몰려 있고, 15·18·22장은
  1개, 17·20·21·23장은 0개. 학습자가 앞부분만 집중적으로 표시하다 만 흔적.
- color는 노션 하이라이트 색 그대로 (blue 92 · orange 30 · red 11 등).
  색별 의미 구분은 노션에서도 일관되지 않았음.

---

## 4. `meanings.json` — 하이라이트 뜻풀이 144개

`expressions.json`의 모든 항목에 대해 1:1로 생성한 해설.

```json
{
  "expressionId": "bsr-h001",
  "term": "nullify",
  "lemma": "nullify",
  "meaningKo": "무효화하다, 상쇄하다",
  "definitionEn": "to cancel something out so it has no effect",
  "nuance": "여기서는 법률적 '무효'가 아니라 두 가지가 서로 상쇄된다는 뜻. 남자는 고음을, 여자는 저음을 못 듣게 되니 서로 비긴다는 농담.",
  "register": "neutral",
  "kind": "word"
}
```

- 영화 속 그 장면 기준의 문맥 해설(`nuance`)이 핵심 가치.
- register 분포: casual 68 · neutral 59 · literary 7 · formal 6 · slang 3 · vulgar 1.

---

## 5. `analysis.json` — 챕터별 학습 분석 (23챕터 전부)

챕터마다 4종 세트. 총 **구문 443 · 문법 173 · 배경지식 92 · 이해도 문제 115**.

```json
{
  "number": 2,
  "title": "...",
  "chunks":        [ 31개 ],
  "grammar":       [ 8개 ],
  "background":    [ 4개 ],
  "comprehension": [ 5개 ]
}
```

**chunks (구문 정리)** — 어려운 문장을 골라 끊어읽기 단위(` / `)로 나누고
직역·의역을 붙인 것:

```json
{
  "en": "I went to school for a summer in Los Angeles. / This fine here?",
  "ko": "여름 한 철 로스앤젤레스에서 학교를 다녔어요. 여기 괜찮아요?",
  "literal": "저는 여름 한 철 동안 로스앤젤레스에서 학교에 다녔어요 / 이거 괜찮아요, 여기?"
}
```

- `en`과 `literal`의 ` / ` 개수는 항상 일치 (검증 완료). `ko`는 자연스러운 의역.
- 챕터당 7~31개. 대본이 긴 챕터일수록 많음. 대본의 모든 문장을 다루는 게
  아니라 **어려운 문장만 선별**한 것.

**grammar (문법 포인트)** — 챕터당 대부분 8개:

```json
{
  "point": "구어의 be동사·조동사 생략 의문문, 그리고 문장 끝의 no?",
  "explanation": "This fine here? = Is this fine here? ... (긴 한국어 해설)",
  "fromScript": "This fine here? / You on holiday? / You get off here, no?",
  "example": "You ready? We should leave now..."
}
```

- `fromScript`는 그 챕터 대본에서 실제로 나온 문장, `example`은 새로 만든 예문.

**background (배경지식)** — 챕터당 3~5개. `{ topic, detail }` 구조.
1995년 유레일패스, 비엔나 명소, 문화적 맥락 등.

**comprehension (이해도 확인)** — 챕터당 정확히 5개. `{ question, answer }`
구조의 서술형 문답 (객관식 아님). 대사 인용을 섞은 내용 이해 질문.

---

## 6. 없는 것 / 주의할 것 (기획할 때 중요)

1. **단어 사전이 없다.** 대본 전체를 커버하는 단어별 뜻 데이터는 없음.
   뜻이 있는 건 하이라이트된 144개(그중 단어는 28개)뿐. 실측: 2장의
   비기초 단어 300개 중 기존 데이터로 뜻을 댈 수 있는 건 **약 4%**.
   → "아무 단어나 탭하면 뜻이 뜬다"는 기능은 추가 생성 없이는 불가능.
2. **단어 난이도 등급 데이터가 없다.** 초등 기초 단어 목록(~300개, 코드에
   하드코딩)으로 거르는 것만 가능. CEFR式 등급 파일은 아직 없음
   (만든다면 빈도 기반 일회성 생성으로 전 작품 커버 가능).
3. **한↔영 문장쌍 데이터가 없다.** (구글 시트 기반 1,948쌍은 다른 두 작품
   것이었고, 비포 선라이즈만 남기는 정리에서 삭제됨.) 문장 단위 연습이
   필요하면 chunks 443개(en·ko 쌍)를 활용하는 방법이 있음.
4. **대본에 한국어 번역이 없다.** 비포 선라이즈는 영어 원문만 있음 (다른 두
   작품과 다른 점). 한국어는 chunks의 선별 문장에만 존재.
5. 하이라이트는 앞 챕터에 쏠려 있어 "챕터별 단어 학습" 재료로는 불균등.
6. Chapter 0(빈 페이지)과 10장(5줄)·16장(11줄)·23장(2줄) 같은 초미니 챕터가
   있어, 하루 1챕터식 커리큘럼을 짤 때 분량 보정이 필요.

---

## 7. 지금 앱에서 이 데이터가 쓰이는 곳 (참고)

- **읽기 탭**: 대본 + 분석 4종을 챕터별로 표시 (원문 / 구문 정리 / 문법 /
  배경지식 / 이해도 확인 섹션 탭).
- **단어 탭**: expressions+meanings 144개가 스와이프 카드 덱으로 들어가 있음
  (라이트너 5상자 SRS, 기초 단어 필터로 9개 숨김).
- **구문독해 탭**: 여기에 4막 13유닛 커리큘럼이 들어갈 예정. Unit 7(would)
  데이터는 `src/data/curriculum/`에 제작 완료 (units / unit-vocab / unit-quiz /
  unit-srs). 화면은 미구현.
- 2026-07 정리: 비포 선라이즈 외 자료(디스인챈트먼트·비포 선셋 대본과 분석,
  문장쌍 1,948개, B2 단어장 899개)는 저장소에서 삭제됨. git 히스토리에만 남아 있음.
