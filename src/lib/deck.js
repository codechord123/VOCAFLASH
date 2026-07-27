// 시드 데이터 → 카드 덱.
//
// 카드는 두 종류다. 같은 SRS 엔진을 쓰지만 앞뒷면의 방향이 반대다.
//
//   expression : 영어 표현 → 뜻      (본인이 하이라이트한 모르는 표현)
//   sentence   : 한국어    → 영어    (한영 문장쌍으로 만드는 작문 연습)
//
// 카드를 자동으로 전량 넣지 않는다. 1,948문장을 한꺼번에 덱에 부으면
// 첫날 "복습 1,948개"가 떠서 사람이 도망간다. 표현은 본인이 직접
// 고른 것이라 전량 넣고, 문장은 사용자가 필요한 만큼만 꺼내 쓴다.

import { createCard } from './srs.js'

/** 하이라이트 색 → 화면 표시용 라벨. 본인이 쓴 색을 그대로 보여준다. */
export const COLOR_LABELS = {
  blue: '파랑',
  orange: '주황',
  yellow_bg: '노랑',
  red: '빨강',
  pink: '분홍',
}

export const KIND_LABELS = {
  word: '단어',
  phrase: '표현',
  sentence: '문장',
}

/**
 * 덱 정의. 카드가 천 개를 넘어가면 "무엇을 복습할지"가 선택 사항이
 * 되어야 한다. 본인이 표시한 것은 기본으로 켜고, 남이 만든 단어장은
 * 꺼둔 채 시작한다 — 첫날 1,100개가 밀리면 앱을 안 열게 된다.
 */
export const DECKS = {
  highlight: {
    id: 'highlight',
    label: '내 하이라이트',
    hint: '노션에서 직접 표시한 모르는 표현',
    defaultOn: true,
    priority: 0,
  },
  note: {
    id: 'note',
    label: '내 메모',
    hint: '시트에 직접 적어둔 어휘 메모',
    defaultOn: true,
    priority: 0,
  },
  b2: {
    id: 'b2',
    label: 'B2 단어장',
    hint: '발음기호·예문·유의어가 붙은 일반 어휘',
    defaultOn: false,
    priority: 1,
  },
  line: {
    id: 'line',
    label: '즐겨찾기 문장',
    hint: '읽다가 담아 둔 대사·자막',
    defaultOn: true,
    priority: 0,
  },
  mistake: {
    id: 'mistake',
    label: '내가 틀린 것',
    hint: '퀴즈·문법 연습에서 틀린 문항이 카드로 돌아옵니다',
    defaultOn: true,
    // 무엇보다 먼저. 밀린 새 카드가 수십 장이어도 틀린 것이 줄 앞에
    // 서야 한다 — 어제 틀린 걸 오늘 만나는 것이 이 덱의 존재 이유다.
    priority: -1,
  },
  unit: {
    id: 'unit',
    label: '커리큘럼 카드',
    hint: '유닛 퀴즈를 마치면 추가되는 어휘·패턴·함정 카드',
    defaultOn: true,
    priority: 0,
  },
}

/**
 * 구문·문장 하이라이트에서 단어 단위로 다시 뽑아낸 카드.
 *
 * 노션 하이라이트 144개 중 단어 한 개짜리는 28개뿐이었다. 나머지 116개는
 * 구문·문장이라 단어 덱에 못 넣는데, 그 안에 정작 모르는 단어가 들어
 * 있었다(a refuge for stray cats의 refuge). 그것만 골라 단어로 세운 것이
 * 이 덱이고, 출처는 여전히 본인 하이라이트다.
 */
export function cardsFromWordCards(words) {
  return words.map((w) =>
    createCard({
      id: `card:${w.id}`,
      type: 'expression',
      front: w.term,
      back: {
        meaningKo: w.meaningKo,
        definitionEn: w.definitionEn ?? null,
        nuance: w.nuance ?? '',
      },
      context: w.context ?? null,
      source: {
        work: 'Before Sunrise',
        chapter: w.chapter ?? null,
        speaker: w.speaker ?? null,
      },
      extra: {
        kind: 'word',
        color: null,
        origin: 'learner-highlight',
        expressionId: w.fromExpressionId ?? null,
        register: w.register ?? null,
        deck: 'highlight',
        priority: DECKS.highlight.priority,
      },
    })
  )
}

/**
 * 본인 하이라이트를 카드로. 전량 넣는다 — 직접 고른 것이라
 * 걸러낼 이유가 없다.
 *
 * 뜻(back)은 생성 데이터에서 채운다. 아직 없으면 null로 두고
 * 화면에서 "뜻 미생성"으로 표시한다 — 조용히 빈 카드를 내보내면
 * 복습 중에 막힌다.
 */
export function cardsFromExpressions(expressions, meanings = {}) {
  return expressions.map((e) => {
    const m = meanings[e.id] ?? meanings[e.text] ?? null
    return createCard({
      id: `card:${e.id}`,
      type: 'expression',
      front: e.text,
      back: m
        ? { meaningKo: m.meaningKo, definitionEn: m.definitionEn, nuance: m.nuance }
        : null,
      context: e.context,
      source: {
        work: 'Before Sunrise',
        chapter: e.chapter,
        chapterTitle: e.chapterTitle,
        speaker: e.speaker ?? null,
      },
      extra: {
        kind: e.kind,
        color: e.color,
        origin: e.origin, // 'learner-highlight' — 본인 표시임을 배지로 구분
        expressionId: e.id,
        deck: 'highlight',
        priority: DECKS.highlight.priority,
      },
    })
  })
}

/**
 * 시트에 직접 적어 둔 어휘 메모를 카드로. 이것도 본인 메모다.
 *
 * 문맥 문장은 빌드할 때 미리 붙여 둔다(scripts/build-vocab-notes.py).
 * 예전에는 이 54개를 만들려고 1.3MB짜리 문장 파일을 통째로 받아왔다.
 */
export function cardsFromVocabNotes(notes) {
  // 시트 메모에도 같은 단어가 두 번 적힌 것이 하나 있다(filthy).
  const seen = new Set()
  return notes
    .filter((v) => {
      const key = (v.term ?? '').trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((v) =>
    createCard({
      id: `card:${v.id}`,
      type: 'expression',
      front: v.term,
      back: { meaningKo: v.gloss, definitionEn: null, nuance: '' },
      context: v.context ?? null,
      source: { work: v.work },
      extra: {
        kind: v.term.trim().includes(' ') ? 'phrase' : 'word',
        color: null,
        origin: 'learner-note',
        possibleTypo: v.possibleTypo ?? false,
        synonyms: v.synonyms ?? [],
        deck: 'note',
        priority: DECKS.note.priority,
      },
    })
  )
}

/**
 * VOCAFLASH에 이미 있던 B2 단어 899개.
 *
 * 앞의 두 덱과 성격이 다르다 — 본인이 읽다가 막힌 표현이 아니라
 * 미리 정리된 일반 어휘다. 그래서 priority를 낮추고 기본은 꺼둔다.
 * 대신 발음기호·예문·유의어·반의어가 갖춰져 있어 카드 뒷면이 풍부하다.
 */
export function cardsFromB2Words(words) {
  // 원본 899줄에는 같은 단어가 여러 번 들어 있다. 주제별로 따로 만든
  // 목록을 이어 붙인 자료라, infrastructure는 다섯 주제에 걸쳐 다섯 번
  // 나오고 automation은 같은 주제 안에서 두 번 나온다(뜻은 같고 예문만
  // 다르다). 그대로 카드로 만들면 넘기는 동안 같은 단어를 계속 다시 본다.
  //
  // 첫 줄만 카드로 만들되 id는 원래 줄 번호를 그대로 쓴다 — id가 밀리면
  // 이미 쌓인 복습 진행이 엉뚱한 단어에 붙는다. 나머지 줄에서는 주제만
  // 거둬 topicIds에 모아, 그 단어가 여러 주제에 걸쳐 있다는 사실은 잃지
  // 않는다.
  const byWord = new Map()

  words.forEach((w, i) => {
    const key = (w.word ?? '').trim().toLowerCase()
    if (!key) return
    const seen = byWord.get(key)
    if (seen) {
      if (w.Topic_ID != null && !seen.topicIds.includes(w.Topic_ID)) {
        seen.topicIds.push(w.Topic_ID)
      }
      return
    }
    byWord.set(key, { row: w, index: i, topicIds: w.Topic_ID != null ? [w.Topic_ID] : [] })
  })

  return [...byWord.values()].map(({ row: w, index, topicIds }) =>
    createCard({
      id: `card:b2-${String(index + 1).padStart(4, '0')}`,
      type: 'expression',
      front: w.word,
      back: { meaningKo: w.Meaning_KR, definitionEn: null, nuance: '' },
      context: w.Example ?? null,
      source: { work: 'B2 단어장' },
      extra: {
        kind: (w.word ?? '').trim().includes(' ') ? 'phrase' : 'word',
        color: null,
        origin: 'curated',
        phonetics: w.Phonetics ?? null,
        exampleKo: w.Example_KR ?? null,
        synonyms: [w.Synonym_1, w.Synonym_2].filter(Boolean),
        antonyms: [w.Antonym_1, w.Antonym_2].filter(Boolean),
        topicId: w.Topic_ID ?? null,
        topicIds,
        deck: 'b2',
        priority: DECKS.b2.priority,
      },
    })
  )
}

/**
 * 문장 카드. 한글 → 영어 작문.
 *
 * 조각(fragment)은 뺀다. 자막이 중간에서 끊긴 "to be autobiographical?"로
 * 작문 연습을 시키면 정답이 성립하지 않는다. 26%가 조각이라 이 필터가
 * 없으면 4문항 중 1개가 불량이다.
 */
export function selectDrillSentences(sentences, { work, limit = 20, exclude = new Set() } = {}) {
  return sentences
    .filter(
      (s) =>
        s.selfContained &&
        !s.truncated &&
        !s.koSupersededByNext &&
        s.ko &&
        s.ko.trim() &&
        s.wordCount >= 4 &&
        (!work || s.work === work) &&
        !exclude.has(s.id)
    )
    .slice(0, limit)
}

export function cardFromSentence(sentence) {
  return createCard({
    id: `card:${sentence.id}`,
    type: 'sentence',
    front: sentence.koFluent || sentence.ko,
    back: { en: sentence.en },
    context: null,
    source: {
      work: sentence.work === 'disenchantment' ? 'Disenchantment' : 'Before Sunset',
      speaker: sentence.speaker ?? null,
    },
    extra: { wordCount: sentence.wordCount, sentenceId: sentence.id },
  })
}

/** 무작위 순서. 문장 연습에서 매번 같은 순서가 나오지 않게. */
export function shuffle(items) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
