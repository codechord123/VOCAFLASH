// 챕터를 다 읽은 뒤 푸는 퀴즈.
//
// 두 가지만 만든다. 지하철에서 서서 하는 공부라 타이핑은 못 한다 —
// 전부 탭으로만 풀린다.
//
//   배열  : 구문 정리가 끊어 놓은 조각을 순서대로 다시 맞춘다
//   빈칸  : 문장에서 표현 하나를 지우고 네 개 중에 고른다
//
// 문제는 새로 만들지 않고 그 챕터가 이미 가진 자료(구문 정리·구문 표·
// 단어 등급)에서 뽑는다. 방금 읽은 문장이 그대로 문제가 되어야 읽기와
// 퀴즈가 한 덩어리가 된다.

import { normalize, segment } from './words.js'

/** 배열 문제로 쓸 조각의 조건. 너무 잘게 쪼개지면 퍼즐이 되고, 너무
    길면 화면을 넘어간다. */
const MIN_PIECES = 2
const MAX_PIECES = 5
const MAX_WORDS_PER_PIECE = 9

function shuffle(items) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** 순서가 원래와 같으면 문제가 안 된다. 다를 때까지 다시 섞는다. */
function shuffleDifferently(items) {
  if (items.length < 2) return [...items]
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const out = shuffle(items)
    if (out.some((x, i) => x !== items[i])) return out
  }
  return [...items].reverse()
}

function pieces(en) {
  return (en ?? '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 슬래시를 걷어낸 한 줄. 빈칸 문제의 본문이 된다. */
function flatten(en) {
  return pieces(en).join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * 배열 문제.
 *
 * 구문 정리가 이미 끊어 놓은 자리를 그대로 쓴다. 그 슬래시는 '여기서
 * 끊어 읽어라'라는 표시라, 조각 하나하나가 의미 단위다. 새로 쪼개면
 * 그 정보를 버리게 된다.
 */
function orderQuestions(analysis) {
  const out = []
  for (const c of analysis?.chunks ?? []) {
    const parts = pieces(c.en)
    if (parts.length < MIN_PIECES || parts.length > MAX_PIECES) continue
    if (parts.some((p) => p.split(/\s+/).length > MAX_WORDS_PER_PIECE)) continue
    out.push({ kind: 'order', answer: parts, ko: c.ko, literal: c.literal ?? null })
  }
  return out
}

/**
 * 빈칸 문제.
 *
 * 지울 것은 구문 표에 있는 표현을 먼저 고른다 — 단어 하나보다 덩어리가
 * 기억에 남고, 오답도 같은 표 안에서 뽑을 수 있어 그럴듯해진다. 표현이
 * 없으면 등급이 붙은 단어를 지운다.
 */
function blankQuestions(analysis, { levels, phrases }) {
  const out = []
  // 오답 후보는 이 챕터 안에서 모은다. 엉뚱한 데서 가져오면 답이 티가 난다.
  const chapterPhrases = new Set()
  const chapterWords = new Map() // 정규화형 → 보이는 형태

  const sentences = []
  for (const c of analysis?.chunks ?? []) {
    const en = flatten(c.en)
    if (en.split(/\s+/).length < 5) continue
    sentences.push({ en, ko: c.ko })
    for (const seg of segment(en, phrases ?? {})) {
      if (seg.kind === 'phrase') chapterPhrases.add(seg.key)
      else if (seg.kind === 'word') {
        const key = normalize(seg.text)
        if ((levels?.[key] ?? 0) >= 2) chapterWords.set(key, seg.text)
      }
    }
  }

  for (const s of sentences) {
    const segs = segment(s.en, phrases ?? {})
    const phraseHit = segs.find((seg) => seg.kind === 'phrase' && seg.key.split(' ').length >= 2)
    const wordHit = segs.find(
      (seg) => seg.kind === 'word' && (levels?.[normalize(seg.text)] ?? 0) >= 2
    )
    const hit = phraseHit ?? wordHit
    if (!hit) continue

    const answer = hit.text
    const pool = phraseHit
      ? [...chapterPhrases].filter((k) => k !== hit.key)
      : [...chapterWords.keys()].filter((k) => k !== normalize(answer))
    // 본문에 이미 나온 것을 오답으로 주면 답이 두 개가 된다
    const inSentence = new Set(
      segs.map((seg) => (seg.kind === 'phrase' ? seg.key : normalize(seg.text ?? '')))
    )
    // 길이가 비슷한 것을 오답으로 준다. 두 단어짜리 답 옆에 한 단어짜리
    // 셋을 놓으면 뜻을 몰라도 모양만 보고 고른다.
    const size = answer.split(/\s+/).length
    const distractors = shuffle(pool.filter((k) => !inSentence.has(k)))
      .sort((a, b) => Math.abs(a.split(' ').length - size) - Math.abs(b.split(' ').length - size))
      .slice(0, 3)
    if (distractors.length < 3) continue

    const at = s.en.indexOf(answer)
    if (at < 0) continue
    out.push({
      kind: 'blank',
      before: s.en.slice(0, at),
      after: s.en.slice(at + answer.length),
      answer,
      choices: shuffle([answer, ...distractors]),
      ko: s.ko,
    })
  }
  return out
}

/**
 * 챕터 퀴즈 한 벌.
 *
 * 한 번에 여섯 문제. 지하철 한 정거장 분량이고, 이보다 길면 다 읽고 난
 * 뒤의 여력으로는 안 끝난다. 배열과 빈칸을 번갈아 낸다.
 */
export function buildQuiz(analysis, { levels, phrases } = {}, size = 6) {
  const orders = shuffle(orderQuestions(analysis))
  const blanks = shuffle(blankQuestions(analysis, { levels, phrases }))

  const out = []
  while (out.length < size && (orders.length || blanks.length)) {
    // 배열부터 — 방금 읽은 흐름을 다시 세우는 쪽이 먼저다
    if (orders.length) out.push(orders.shift())
    if (out.length < size && blanks.length) out.push(blanks.shift())
  }

  return out.map((q) =>
    q.kind === 'order' ? { ...q, shuffled: shuffleDifferently(q.answer) } : q
  )
}

/** 배열 정답 확인. 조각 내용이 순서대로 같으면 맞다. */
export function orderIsCorrect(picked, answer) {
  return picked.length === answer.length && picked.every((p, i) => p === answer[i])
}
