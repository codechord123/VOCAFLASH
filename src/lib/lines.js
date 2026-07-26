// 문장 즐겨찾기.
//
// 읽다가 마음에 걸리는 줄을 그 자리에서 담아 두고 나중에 다시 본다.
// 단위는 작품이 이미 나눠 놓은 것을 그대로 쓴다 — 비포 선라이즈는 인물
// 대사 한 줄, 시트에서 온 두 작품은 자막 한 줄. 새로 쪼개지 않는다.
//
// 저장은 카드로 한다. 별도 목록을 만들면 복습 엔진(라이트너)을 다시
// 짜야 하고, 즐겨찾기가 '모아만 두고 안 보는 곳'이 된다.

import { createCard } from './srs.js'

/**
 * 줄의 고유 id. 작품·챕터·줄 번호로 만든다.
 *
 * 본문 해시가 아니라 위치를 쓰는 이유: 같은 대사("Yeah.")가 한 챕터에
 * 여러 번 나오는데, 해시로 잡으면 서로 다른 장면이 한 카드로 뭉친다.
 */
export function lineId(work, chapter, index) {
  return `line:${work}-c${chapter}-l${index}`
}

/**
 * 비포 선라이즈 대사의 번역을 구문 정리에서 찾아본다.
 *
 * 이 작품은 원문만 있고 번역이 없다. 다만 챕터 해설의 구문 정리(chunks)가
 * 어려운 문장을 골라 번역해 두었으므로, 담는 줄이 거기 있으면 그 번역을
 * 같이 저장한다. 못 찾으면 번역 없이 담는다 — 원문만으로도 복습은 된다.
 */
export function findChunkKo(chunks, text) {
  if (!chunks?.length || !text) return null
  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/\s*\/\s*/g, ' ')
      .replace(/[“”‘’]/g, "'")
      .replace(/[^a-z' ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const needle = norm(text)
  if (needle.length < 12) return null

  // 겹치기만 하면 갖다 붙이면 안 된다. 구문 정리는 긴 대사에서 한 문장만
  // 떼어낸 것이 많아서, 그 번역을 대사 전체의 번역으로 보여주면 틀린 뜻을
  // 외우게 된다("...하고 나서 어디까지 가세요?"만 남는 식). 서로의 길이가
  // 크게 다르면 다른 문장으로 본다.
  const COVERAGE = 0.6

  for (const c of chunks) {
    const hay = norm(c.en)
    if (!hay) continue
    const overlaps = hay.includes(needle) || needle.includes(hay)
    if (!overlaps) continue
    const ratio =
      Math.min(hay.length, needle.length) / Math.max(hay.length, needle.length)
    if (ratio >= COVERAGE) return c.ko ?? null
  }
  return null
}

/**
 * 드래그해서 고른 토막을 카드로.
 *
 * id는 본문 그 자체로 만든다 — 위치로 만들면 같은 문장을 두 챕터에서
 * 그었을 때 서로 다른 카드가 되고, 무엇보다 어디를 그었는지가 아니라
 * 무엇을 그었는지가 중요하다.
 */
export function cardFromSelection({ work, workTitle, chapter, text, ko, speaker }) {
  const key = text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48)
  return createCard({
    id: `line:sel-${work}-${key}`,
    type: 'line',
    front: text,
    back: { meaningKo: ko ?? '', definitionEn: null, nuance: '' },
    context: null,
    source: { work: workTitle, chapter, chapterTitle: null, speaker: speaker ?? null },
    extra: {
      kind: 'line',
      origin: 'reader-selection',
      deck: 'line',
      priority: 0,
      workId: work,
    },
  })
}

/** 줄 하나를 복습 카드로. 앞면 영어, 뒷면 번역(있으면). */
export function cardFromLine({ work, workTitle, chapter, chapterTitle, index, en, ko, speaker }) {
  return createCard({
    id: lineId(work, chapter, index),
    type: 'line',
    front: en,
    back: { meaningKo: ko ?? '', definitionEn: null, nuance: '' },
    context: null,
    source: { work: workTitle, chapter, chapterTitle: chapterTitle ?? null, speaker: speaker ?? null },
    extra: {
      kind: 'line',
      origin: 'reader-bookmark',
      deck: 'line',
      priority: 0,
      workId: work,
      lineIndex: index,
    },
  })
}
