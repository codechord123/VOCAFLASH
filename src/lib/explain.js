// 어려운 대목의 해설 찾기.
//
// 챕터마다 구문 정리(chunks)와 문법이 이미 만들어져 있는데, 정작 원문을
// 읽다가 막혔을 때는 탭을 갈아타서 그 대목을 눈으로 찾아야 했다. 읽던
// 자리에서 바로 꺼내 볼 수 있어야 쓰인다.
//
// 없는 것을 지어내지는 않는다. 정리된 게 없으면 없다고 말하고, 대신 그
// 안에 든 표현(구문·문법 표에 있는 것)이라도 보여준다.

import { normalize, segment } from './words.js'

/** 비교용 정규화. 말줄임표·따옴표·슬래시는 지우고 단어만 남긴다. */
function norm(s) {
  return (s ?? '')
    .toLowerCase()
    .replace(/[“”‘’]/g, "'")
    .replace(/[^a-z' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 둘이 같은 대목을 가리키는가.
 *
 * 한쪽이 다른 쪽에 통째로 들어가면 같은 대목으로 본다. 구문 정리는 긴
 * 대사에서 한 문장만 떼어낸 것이 많고, 반대로 손으로 그은 토막이 정리된
 * 문장보다 짧을 때도 있어서 양방향으로 본다.
 *
 * 카드에 번역을 붙일 때(findChunkKo)는 길이가 비슷해야 한다는 조건을
 * 걸었지만, 여기서는 반대다. 짧게 그은 토막이 긴 해설 안에 들어 있으면
 * 그 해설이야말로 보고 싶은 것이다.
 */
function overlaps(a, b, minWords = 3) {
  if (!a || !b) return false
  if (a.split(' ').length < minWords || b.split(' ').length < minWords) return false
  return a.includes(b) || b.includes(a)
}

/** 구문 정리는 한 항목이 여러 조각(/)으로 나뉘어 있다. 조각별로도 본다. */
function chunkPieces(en) {
  const whole = norm(en)
  const parts = (en ?? '').split('/').map(norm).filter(Boolean)
  return parts.length > 1 ? [whole, ...parts] : [whole]
}

/** 문법 항목의 fromScript도 같은 방식으로 여러 조각이다. */
function grammarPieces(g) {
  return (g?.fromScript ?? '').split('/').map(norm).filter(Boolean)
}

/**
 * 이 대목에 붙는 해설을 모은다.
 *
 * @param text     찾을 원문 (그은 토막이든 대사 한 줄이든)
 * @param analysis 그 챕터의 해설 (없으면 구문·문법은 비어서 나온다)
 * @param phrases  구문 표 (그 안에 든 표현을 훑기 위해)
 */
export function explainFor(text, analysis, phrases) {
  const needle = norm(text)
  const chunks = []
  const grammar = []

  for (const c of analysis?.chunks ?? []) {
    if (chunkPieces(c.en).some((piece) => overlaps(piece, needle))) chunks.push(c)
  }
  for (const g of analysis?.grammar ?? []) {
    if (grammarPieces(g).some((piece) => overlaps(piece, needle))) grammar.push(g)
  }

  // 그 안에 든 표현. 구문 정리가 없는 대목이라도 이건 거의 항상 나온다.
  const seen = new Set()
  const inside = []
  if (phrases) {
    for (const seg of segment(text, phrases)) {
      if (seg.kind !== 'phrase' || seen.has(seg.key)) continue
      seen.add(seg.key)
      inside.push({ key: seg.key, text: seg.text, entry: phrases[seg.key] })
    }
  }

  return { chunks, grammar, phrases: inside }
}

/** 볼 것이 하나라도 있는가. 버튼을 띄울지 정할 때 쓴다. */
export function hasExplanation(e) {
  return Boolean(e && (e.chunks.length || e.grammar.length || e.phrases.length))
}

/**
 * 챕터의 어느 줄에 해설이 붙어 있는지 미리 표시해 둔다.
 *
 * 그어 봐야 아는 것으로는 부족하다 — 어디에 준비된 설명이 있는지 보이면
 * 그 줄에서 한 번 더 멈추게 된다.
 */
export function linesWithExplanation(lines, analysis, textOf = (l) => l.text) {
  const marked = new Set()
  if (!analysis) return marked
  const pieces = [
    ...(analysis.chunks ?? []).flatMap((c) => chunkPieces(c.en)),
    ...(analysis.grammar ?? []).flatMap(grammarPieces),
  ]
  lines.forEach((line, i) => {
    const t = norm(textOf(line))
    if (!t) return
    if (pieces.some((piece) => overlaps(piece, t, 4))) marked.add(i)
  })
  return marked
}

/** 팝업 제목에 쓸 짧은 이름. 그은 토막이 길면 앞뒤만 남긴다. */
export function shortLabel(text, max = 42) {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

export { norm as normForMatch, normalize }
