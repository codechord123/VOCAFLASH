// 오답 은행.
//
// 챕터 퀴즈에서 틀린 문장, 문법 연습에서 틀린 문항은 그동안 그 화면에서
// 끝났다 — 결과에 잠깐 떴다가 사라지고, 돌아오는 길이 없었다. 배움은
// 틀린 자리를 간격을 두고 다시 만날 때 일어난다. 여기서는 모든 활동의
// 오답을 카드로 회수해 복습 덱에 넣는다. 오늘 퀴즈에서 틀린 것을 내일
// 아침 단어 칸에서 다시 만나고, 라이트너가 간격을 벌려 간다.
//
// id는 내용에서 만든다 — 같은 문제를 두 번 틀려도 카드는 한 장이고,
// 이미 쌓인 복습 진행이 그대로 이어진다.

import { createCard } from './srs.js'
import { DECKS } from './deck.js'

function slug(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 44)
}

function mistakeCard({ id, front, back, context, source }) {
  return createCard({
    id,
    type: 'expression',
    front,
    back,
    context: context ?? null,
    source,
    extra: {
      kind: 'mistake',
      origin: 'mistake',
      deck: 'mistake',
      priority: DECKS.mistake.priority,
    },
  })
}

/**
 * 챕터 퀴즈의 오답 → 카드.
 *
 * 빈칸을 틀렸으면 같은 빈칸을 앞면에 두고, 배열을 틀렸으면 번역을 앞면에
 * 두고 원문을 되짚게 한다 — 틀린 그 일을 그대로 다시 시키는 카드다.
 */
export function cardsFromQuizWrong(wrong = [], { work = 'Before Sunrise', chapter = null } = {}) {
  return wrong
    .map((w) => {
      if (w.kind === 'blank' && w.answer) {
        return mistakeCard({
          id: `card:miss-blank-${slug(w.answer)}-${slug(w.en).slice(0, 20)}`,
          front: w.en.replace(w.answer, '______'),
          back: { meaningKo: w.answer, definitionEn: null, nuance: w.ko ?? '' },
          source: { work, chapter, speaker: null },
        })
      }
      if (w.kind === 'order' && w.ko) {
        return mistakeCard({
          id: `card:miss-order-${slug(w.en)}`,
          front: w.ko, // 한 → 영 재구성
          back: { meaningKo: w.en, definitionEn: null, nuance: '' },
          source: { work, chapter, speaker: null },
        })
      }
      return null
    })
    .filter(Boolean)
}

/** 문법 연습의 오답 → 카드. 답과 함께 '왜 그런지'를 뒷면에 싣는다. */
export function cardsFromGrammarWrong(unit, questions = []) {
  return questions
    .map((q) => {
      const source = { work: `문법 ${unit.order} · ${unit.title}`, chapter: null, speaker: null }
      if (q.kind === 'choice') {
        return mistakeCard({
          id: `card:miss-gr-${unit.id}-${slug(q.sentence)}`,
          front: q.sentence.replace('___', '______'),
          back: { meaningKo: q.answer === '-' ? '(아무것도 안 붙임)' : q.answer, definitionEn: null, nuance: q.why ?? '' },
          source,
        })
      }
      return mistakeCard({
        id: `card:miss-gr-${unit.id}-${slug(q.answer.join(' '))}`,
        front: q.ko,
        back: { meaningKo: q.answer.join(' '), definitionEn: null, nuance: q.why ?? '' },
        source,
      })
    })
    .filter(Boolean)
}

/**
 * 말하기에서 🔴(못 했다)로 자평한 것 → 카드.
 * 앞면은 한국어(다시 입으로 만들게), 뒷면은 모범 문장이다.
 */
export function cardsFromSpeakWrong(items = []) {
  return items
    .map((it) => {
      if (!it.en || !it.ko) return null
      return mistakeCard({
        id: `card:miss-speak-${slug(it.en)}`,
        front: it.ko,
        back: { meaningKo: it.en, definitionEn: null, nuance: it.note ?? '' },
        source: { work: it.label ?? '말하기', chapter: null, speaker: null },
      })
    })
    .filter(Boolean)
}

/** 상태에 오답 카드를 넣는다. 이미 있는 id는 건드리지 않는다 —
    복습 진행이 그 id에 붙어 있다. */
export function addMistakeCards(state, cards) {
  if (!cards.length) return state
  const existing = new Set(state.cards.map((c) => c.id))
  const fresh = cards.filter((c) => !existing.has(c.id))
  return fresh.length ? { ...state, cards: [...state.cards, ...fresh] } : state
}
