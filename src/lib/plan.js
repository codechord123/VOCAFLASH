// 100일 커리큘럼.
//
// 구문 13유닛 + 문법 12유닛 = 25유닛. 유닛 하나에 4일을 주면 정확히
// 100일이다 — 숫자를 억지로 맞춘 것이 아니라 재고가 그렇게 떨어진다.
//
// 하루는 세 칸이다. 매일 아침 20~30분 분량.
//   단어  오늘 볼 카드 넘기기 (매일, SRS가 정한다)
//   과업  이번 유닛의 오늘 몫 (4일 리듬: 배우기→되짚기→말하기→정리)
//   회독  오늘의 챕터 한 번 (24챕터가 돌아가며, 100일이면 챕터당 +4회독)
//
// 달력에 묶지 않는다. 예전 100일 플랜은 날짜가 밀리는 순간 무너져서
// 지웠다. 여기서는 N일차를 끝내야 N+1일차가 열린다 — 하루를 걸러도
// 계획은 그 자리에서 기다린다.

// 유닛 제목. 목적지 화면에도 있지만, 오늘 화면에서 "구문 Unit 7"만
// 보이면 그게 뭔지 몰라 누르기 전까지 하루 크기를 가늠할 수 없다.
const SYNTAX_TITLES = [
  '생략 의문문 + 문미 부가', '담화표지와 축약', '얼버무림·완충',
  '현재완료 경험·계속', '현재완료진행', '과거완료', 'would의 반복 용법',
  '비교 구문', '강조·도치', '명사절·관계사 확장', '지각동사 + -ing',
  '가정법 (과거/과거완료/혼합)', 'wish + 과거완료 / 후회',
]
const GRAMMAR_TITLES = [
  '지금 하는 중 vs 늘 하는 것', '언제 있었는지 말할 때 vs 말 안 할 때',
  '앞일을 말하는 세 가지', '부탁할 때 세기 조절하기',
  '물어보기 — 뒤집기와 안 뒤집기', 'a · the · 아무것도 안 붙이기',
  '설명을 뒤에 붙이기', '누가 했는지 말 안 할 때', '견주어 말하기',
  '만약에 — 진짜 가정과 상상', '동사 뒤에 to를 붙일까 -ing를 붙일까',
  'in · on · at — 시간과 자리',
]

// 읽을 수 있는 챕터. 2장은 2a(2)·2b(2.5)로 나뉘어 있다.
const CHAPTERS = [1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]

export const TOTAL_DAYS = 100

/**
 * N일차의 구성.
 *
 * 블록(4일)이 유닛 하나를 맡는다. 홀수 블록은 구문, 짝수 블록은 문법 —
 * 번갈아 나와야 한쪽에 물리지 않는다. 블록 안의 4일 리듬:
 *   1일 배우기   유닛을 처음부터 (구문: 학습+퀴즈 / 문법: 설명+연습)
 *   2일 되짚기   틀린 것 위주로 다시 (하루 자고 나서 다시 보는 것이 요점)
 *   3일 내 것으로 구문: 유닛 카드 복습 / 문법: 말하기 과제를 소리 내어
 *   4일 정리     오늘의 챕터를 깊게 — 읽고 챕터 퀴즈까지
 */
export function dayPlan(day) {
  const d = Math.min(Math.max(1, day), TOTAL_DAYS)
  const block = Math.floor((d - 1) / 4) + 1
  const step = ((d - 1) % 4) + 1
  const isSyntax = block % 2 === 1
  const unitNo = Math.ceil(block / 2)
  const unit = isSyntax
    ? { kind: 'syntax', id: `u-${String(unitNo).padStart(2, '0')}`, no: unitNo, title: SYNTAX_TITLES[unitNo - 1] }
    : { kind: 'grammar', id: `g-${String(unitNo).padStart(2, '0')}`, no: unitNo, title: GRAMMAR_TITLES[unitNo - 1] }

  const chapter = CHAPTERS[(d - 1) % CHAPTERS.length]

  const kindLabel = isSyntax ? '구문' : '문법'
  const unitName = `${kindLabel} ${unit.no} · ${unit.title}`

  const MAIN = {
    1: {
      label: `${unitName} — 배우기`,
      hint: isSyntax ? '앵커 장면부터 퀴즈까지 한 번에' : '설명을 읽고 연습 6문항',
      tab: unit.kind,
      auto: 'unit-progress', // 유닛 진행이 기록되면 자동으로 체크된다
    },
    2: {
      label: `${unitName} — 되짚기`,
      hint: isSyntax ? '퀴즈를 다시 — 틀렸던 자리 위주로' : "연습에서 '틀린 것만 다시'",
      tab: unit.kind,
      auto: null, // 다시 푼 것은 밖에서 알 수 없다 — 직접 체크
    },
    3: isSyntax
      ? { label: `${unitName} — 카드 복습`, hint: '유닛 카드가 복습 덱에 들어와 있다', tab: 'vocab', auto: null }
      : { label: `${unitName} — 말하기`, hint: '과제 2개를 소리 내어, 그다음 모범과 대조', tab: 'grammar', auto: null },
    4: {
      label: `오늘의 챕터 깊게 — 퀴즈까지`,
      hint: '회독으로 읽고, 맨 아래 챕터 퀴즈로 확인',
      tab: 'read',
      auto: 'chapter-quiz', // 오늘 그 챕터 퀴즈를 풀면 체크된다
    },
  }

  return {
    day: d,
    block,
    step,
    unit,
    chapter,
    items: [
      {
        id: 'word',
        label: '오늘 볼 카드 넘기기',
        hint: '복습이 정한 만큼만 — 0이면 이미 끝난 것',
        tab: 'vocab',
        auto: 'due-zero',
      },
      { id: 'main', ...MAIN[step] },
      {
        id: 'read',
        label: `${chapterLabel(chapter)}장 회독`,
        hint: '다 읽고 읽음을 누르면 체크됩니다',
        tab: 'read',
        chapter,
        auto: 'read-today',
      },
    ],
  }
}

export function chapterLabel(n) {
  if (n === 2) return '2a'
  if (n === 2.5) return '2b'
  return String(n)
}

/** 같은 날인가(자정 기준). 회독·퀴즈의 '오늘 했음'을 판정할 때 쓴다. */
export function sameDay(ts, now = Date.now()) {
  if (!ts) return false
  const a = new Date(ts)
  const b = new Date(now)
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * 항목의 자동 완료 판정. 손으로도 체크할 수 있지만(checks), 앱이 이미
 * 아는 사실은 앱이 채워 준다 — 스스로 보고하게 시키면 숫자가 후해진다.
 */
export function itemDone(item, plan, ctx) {
  if (plan?.checks?.[item.id]) return true
  switch (item.auto) {
    case 'due-zero':
      return ctx.dueCount === 0
    case 'read-today': {
      const rec = ctx.reads?.[`before-sunrise-c${item.chapter}`]
      return sameDay(rec?.lastAt)
    }
    case 'unit-progress': {
      const u = ctx.unit
      if (u.kind === 'syntax') return ctx.curriculum?.unitProgress?.[u.id]?.screen === 'done'
      return Boolean(ctx.grammar?.unitProgress?.[u.id])
    }
    case 'chapter-quiz': {
      const rec = ctx.quizLog?.[`before-sunrise-c${ctx.chapter}`]
      return sameDay(rec?.last?.at)
    }
    default:
      return false
  }
}

/** N일차를 마치고 다음 날로. 이력을 남겨야 달력 없이도 흐름이 보인다. */
export function completeDay(state) {
  const plan = state.plan ?? { day: 1, checks: {}, history: {} }
  return {
    ...state,
    plan: {
      day: Math.min(plan.day + 1, TOTAL_DAYS + 1),
      checks: {},
      history: { ...plan.history, [plan.day]: Date.now() },
    },
  }
}

export function toggleCheck(state, itemId) {
  const plan = state.plan ?? { day: 1, checks: {}, history: {} }
  return {
    ...state,
    plan: { ...plan, checks: { ...plan.checks, [itemId]: !plan.checks[itemId] } },
  }
}
