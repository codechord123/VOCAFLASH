// 시드 데이터 → 카드 덱.
//
// 카드는 expression 하나다: 영어 표현 → 뜻. 비포 선라이즈에서 본인이
// 하이라이트한 표현 전량과, 읽다가 직접 저장하는 단어가 여기 담긴다.

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
 * 덱 정의. 본인이 노션에서 표시한 것과 앱에서 읽다가 저장한 것을
 * 구분한다. 둘 다 본인이 고른 것이라 기본으로 켠다.
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
    hint: '읽다가 직접 저장한 단어',
    defaultOn: true,
    priority: 0,
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
