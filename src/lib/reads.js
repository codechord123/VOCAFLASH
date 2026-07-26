// 회독 기록.
//
// 목표는 20회독이다. 한 챕터를 스무 번 읽으면 그 장면의 영어가 몸에
// 남는다는 것이 이 학습법의 전제이고, 그렇다면 "지금 몇 번째인지"와
// "마지막으로 언제 읽었는지"가 화면에 있어야 한다. 없으면 스무 번은
// 셀 수 없는 숫자가 된다.
//
// 자동으로 세지 않는다. 챕터를 열기만 해도 올라가면 숫자가 거짓이 되고,
// 거짓인 숫자는 아무도 안 본다. 다 읽고 직접 누른 것만 센다.

export const READ_GOAL = 20

/** 작품·챕터 → 기록 키. 저장본 안에서 작품이 섞이지 않게 한다. */
export function readKey(work, chapter) {
  return `${work}-c${chapter}`
}

/** { count, lastAt } — 없으면 0회 */
export function readOf(reads, work, chapter) {
  return reads?.[readKey(work, chapter)] ?? { count: 0, lastAt: null }
}

/** 한 번 더 읽었다고 기록한다. */
export function markRead(state, work, chapter) {
  const key = readKey(work, chapter)
  const prev = state.reads?.[key] ?? { count: 0, lastAt: null }
  return {
    ...state,
    reads: {
      ...(state.reads ?? {}),
      [key]: { count: prev.count + 1, lastAt: Date.now() },
    },
  }
}

/** 잘못 눌렀을 때 되돌린다. 되돌릴 수 없으면 누르기를 주저하게 된다. */
export function undoRead(state, work, chapter) {
  const key = readKey(work, chapter)
  const prev = state.reads?.[key]
  if (!prev || prev.count <= 0) return state
  const next = { ...(state.reads ?? {}) }
  if (prev.count === 1) delete next[key]
  else next[key] = { count: prev.count - 1, lastAt: prev.lastAt }
  return { ...state, reads: next }
}

/**
 * 언제 읽었는지를 사람이 읽는 말로.
 *
 * 날짜보다 '며칠 전'이 먼저 필요하다 — 어제 읽었는지 두 주 전에 읽었는지가
 * 오늘 무엇을 읽을지 정하기 때문이다. 오래된 것만 날짜로 보여준다.
 */
export function lastReadLabel(lastAt, now = Date.now()) {
  if (!lastAt) return null
  const day = 86400000
  const startOf = (t) => new Date(t).setHours(0, 0, 0, 0)
  const days = Math.round((startOf(now) - startOf(lastAt)) / day)

  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  if (days < 30) return `${Math.floor(days / 7)}주 전`
  return new Date(lastAt).toLocaleDateString('ko', { month: 'long', day: 'numeric' })
}
