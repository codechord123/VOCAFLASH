// 간격반복(SRS) 엔진 — Leitner 5박스.
//
// SM-2 전체 구현은 개인용 앱에 과하다. 박스별 고정 간격이면
// 충분하고, 사용자가 "왜 이 카드가 오늘 나왔는지" 설명할 수 있다.
//
// 노션의 `회독` 필드가 손으로 세던 것을 이 엔진이 대신한다.

/** 박스별 재등장 간격(일). 박스 1이 가장 자주. */
export const BOX_INTERVALS = [1, 3, 7, 14, 30]
export const MAX_BOX = BOX_INTERVALS.length

/** 복습 평가 3단계. 손가락 하나로 누를 수 있는 개수. */
export const GRADES = {
  AGAIN: 'again', // 몰랐음 → 박스 1로 복귀
  HARD: 'hard', // 헷갈림 → 박스 유지
  GOOD: 'good', // 알았음 → 다음 박스
}

const DAY_MS = 86400000

/** 시간을 버린 날짜 키. 로컬 자정 기준으로 "오늘"을 판단한다. */
export function dayKey(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function addDays(date, days) {
  return new Date(dayKey(date) + days * DAY_MS)
}

/**
 * 새 카드 하나를 만든다. 아직 한 번도 복습하지 않은 상태.
 * `box: 1`, `dueAt: 오늘` — 즉 만들자마자 오늘 복습 대상이 된다.
 */
export function createCard(fields) {
  return {
    id: fields.id,
    type: fields.type, // 'expression' | 'sentence'
    front: fields.front,
    back: fields.back,
    context: fields.context ?? null,
    source: fields.source ?? null,
    box: 1,
    dueAt: dayKey(),
    reviewCount: 0,
    lapseCount: 0,
    lastReviewedAt: null,
    createdAt: Date.now(),
    ...fields.extra,
  }
}

/**
 * 평가를 적용해 다음 상태를 반환한다. 원본을 변형하지 않는다.
 *
 * AGAIN은 박스를 1로 되돌린다 — 부분 감점(박스 -1)보다 단순하고,
 * 모르는 것을 확실히 다시 보게 한다.
 */
export function applyGrade(card, grade, now = new Date()) {
  let box = card.box
  let lapseCount = card.lapseCount

  if (grade === GRADES.GOOD) {
    box = Math.min(card.box + 1, MAX_BOX)
  } else if (grade === GRADES.AGAIN) {
    box = 1
    lapseCount += 1
  }
  // HARD: 박스 유지 — 간격만 다시 시작된다.

  const interval = BOX_INTERVALS[box - 1]

  return {
    ...card,
    box,
    lapseCount,
    dueAt: dayKey(addDays(now, interval)),
    reviewCount: card.reviewCount + 1,
    lastReviewedAt: now.getTime(),
  }
}

/**
 * 카드에서 복습 진행만 떼어낸다.
 *
 * 진행(박스·예정일·횟수)과 내용(단어·뜻·문맥)은 수명이 다르다. 내용은
 * 앱과 함께 배포되는 고정 자료이고, 진행은 매일 바뀌는 사용자의 것이다.
 * 한 덩어리로 저장하면 자료 구성을 바꿀 때마다 진행이 함께 흔들린다 —
 * 실제로 덱을 정리하다가 복습 기록을 날린 적이 있다.
 */
export function progressOf(card) {
  return {
    box: card.box,
    dueAt: card.dueAt,
    reviewCount: card.reviewCount,
    lapseCount: card.lapseCount,
    lastReviewedAt: card.lastReviewedAt ?? null,
  }
}

/** 저장된 진행을 카드에 입힌다. 없으면 새 카드 상태 그대로. */
export function withProgress(card, progress) {
  return progress ? { ...card, ...progress } : card
}

/** 오늘 복습 대상인가. */
export function isDue(card, now = new Date()) {
  return card.dueAt <= dayKey(now)
}

/**
 * 오늘 볼 카드를 고른다.
 *
 * 카드가 수백 개로 늘어나면 "오늘 200개"가 떠서 사람이 도망간다.
 * 그래서 상한을 둔다. 정렬 순서에 의도가 있다:
 *   1) 낮은 박스 먼저 — 모르는 것을 우선한다
 *   2) 오래 밀린 것 먼저 — 밀린 카드가 영구히 뒤로 밀리지 않게
 *   3) 자주 틀린 것 먼저
 */
export function selectDueCards(cards, { limit = 20, now = new Date() } = {}) {
  return cards
    .filter((c) => isDue(c, now))
    .sort(
      (a, b) =>
        // 본인이 직접 표시·메모한 것이 항상 먼저. 남이 고른 단어장보다
        // 읽다가 스스로 막힌 표현의 우선순위가 높다.
        (a.priority ?? 0) - (b.priority ?? 0) ||
        a.box - b.box ||
        a.dueAt - b.dueAt ||
        b.lapseCount - a.lapseCount
    )
    .slice(0, limit)
}

/** 상단에 띄울 요약. 빈 상태 화면을 그릴 때도 쓴다. */
export function deckStats(cards, now = new Date()) {
  const due = cards.filter((c) => isDue(c, now))
  const byBox = Array.from({ length: MAX_BOX }, (_, i) =>
    cards.filter((c) => c.box === i + 1).length
  )
  return {
    total: cards.length,
    due: due.length,
    fresh: cards.filter((c) => c.reviewCount === 0).length,
    learned: cards.filter((c) => c.box === MAX_BOX).length,
    byBox,
  }
}
