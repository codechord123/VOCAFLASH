// 챕터 퀴즈 기록.
//
// 점수가 그때뿐이면 약한 자리를 알려주지 못한다. 어느 챕터를 몇 번
// 풀었고, 무엇을 틀렸는지 남겨 두면 다시 열 이유가 생긴다.
//
// 회독과 같은 키 규칙을 쓴다 — 작품·챕터로 갈라 두면 저장본 안에서
// 섞이지 않는다.

import { readKey } from './reads.js'

/** { attempts, best, last: { right, total, at }, wrong: [...] } */
export function quizRecord(quizLog, work, chapter) {
  return quizLog?.[readKey(work, chapter)] ?? null
}

/**
 * 한 번 푼 결과를 기록한다.
 *
 * 틀린 자리는 마지막 회차 것만 남긴다. 쌓아 두면 이미 고친 것까지
 * 계속 따라다녀서, 목록을 보고도 무엇이 지금 약한지 알 수 없다.
 */
export function recordQuiz(state, work, chapter, { right, total, wrong = [] }) {
  const key = readKey(work, chapter)
  const prev = state.quizLog?.[key] ?? { attempts: 0, best: 0 }
  return {
    ...state,
    quizLog: {
      ...(state.quizLog ?? {}),
      [key]: {
        attempts: prev.attempts + 1,
        best: Math.max(prev.best ?? 0, right),
        last: { right, total, at: Date.now() },
        wrong: wrong.slice(0, 8),
      },
    },
  }
}

/** '오늘 · 5/6' 같은 한 줄. 없으면 null. */
export function quizLabel(rec) {
  if (!rec?.last) return null
  const days = Math.floor((Date.now() - rec.last.at) / 86400000)
  const when = days === 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`
  return `${when} · ${rec.last.right}/${rec.last.total}`
}
