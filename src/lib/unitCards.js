// 구문 유닛의 복습 카드 — 어휘·패턴·함정.
//
// 예전에는 구문 탭의 퀴즈를 마칠 때만 들어왔다. 매일 수업만 따라가는
// 사람은 유닛을 졸업해도 카드가 한 장도 안 생겼다. 이제 구문 탭과 수업
// (유닛을 졸업하는 날의 정리)이 같은 함수로 넣는다.

import srsData from '../data/curriculum/unit-srs.json'
import { createCard } from './srs.js'
import { DECKS } from './deck.js'

/** 유닛 SRS 카드 → 앱 카드. 종류마다 뒷면 재료가 다르다. */
export function cardFromUnitSrs(c) {
  const base = {
    id: `card:${c.cardId}`,
    type: 'expression',
    source: { work: 'Before Sunrise', unitId: c.unitId },
    extra: {
      kind: c.kind,
      origin: 'unit-srs',
      unitId: c.unitId,
      deck: 'unit',
      priority: DECKS.unit.priority,
    },
  }
  if (c.kind === 'vocab') {
    return createCard({
      ...base,
      front: c.front,
      back: { meaningKo: c.back.meaningKo, definitionEn: null, nuance: c.back.nuance },
      context: c.back.context ?? null,
    })
  }
  if (c.kind === 'pattern') {
    return createCard({
      ...base,
      front: c.front,
      back: { meaningKo: c.back.pattern, definitionEn: null, nuance: c.back.explanation },
      context: c.back.anchor ?? null,
    })
  }
  // trap — "맞나?" 판정 카드
  return createCard({
    ...base,
    front: c.front,
    back: {
      meaningKo: c.back.verdict === false ? '✗ 틀린 문장' : '⭕ 맞는 문장',
      definitionEn: null,
      nuance: c.back.reason,
    },
    context: null,
  })
}

/**
 * 유닛의 카드를 상태에 넣는다. 한 번만 들어간다(id로 거른다).
 *
 * 같은 단어가 여러 유닛에 배정되기도 하고(mannerism은 네 유닛), 이미
 * 하이라이트 카드로 갖고 있는 것도 있다. 앞면이 같은 어휘 카드는 넣지
 * 않는다 — 복습이 겹쳐서 시간만 먹는다.
 *
 * @param knownFronts  이미 있는 카드 앞면(소문자) — 고정 자료 카드 포함
 */
export function addUnitCards(state, unitId, knownFronts = new Set()) {
  const norm = (t) => (t ?? '').trim().toLowerCase()
  const existing = new Set(state.cards.map((c) => c.id))
  const fresh = srsData.cards
    .filter((c) => c.unitId === unitId && !c.recitationOnly)
    .map(cardFromUnitSrs)
    .filter((c) => !existing.has(c.id))
    .filter((c) => c.kind !== 'vocab' || !knownFronts.has(norm(c.front)))
  return fresh.length ? { ...state, cards: [...state.cards, ...fresh] } : state
}

/** 유닛이 복습 덱에 넣을 카드 수(암송 전용 제외) */
export function unitCardCount(unitId) {
  return srsData.cards.filter((c) => c.unitId === unitId && !c.recitationOnly).length
}
