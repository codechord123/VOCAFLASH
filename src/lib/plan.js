// 100일 커리큘럼.
//
// 표는 scripts/build-plan.py가 저작한다 — 공식이 아니라 순서다.
// 짝이 되는 구문·문법 유닛을 붙이고(질문 만들기 → 생략 의문문),
// 유닛을 배우는 날의 회독 챕터를 그 유닛의 앵커 장면과 맞추고,
// 남는 회독 자리는 가장 덜 읽은 챕터부터 채운다.
//
// 하루는 세 칸이다. 매일 아침 20~30분 분량.
//   단어  오늘 볼 카드 넘기기 (매일, SRS가 정한다)
//   과업  이번 유닛의 오늘 몫 (4일 리듬: 배우기→되짚기→내 것으로→정리)
//   회독  오늘의 챕터 한 번
//
// 달력에 묶지 않는다. 예전 100일 플랜은 날짜가 밀리는 순간 무너져서
// 지웠다. 여기서는 N일차를 끝내야 N+1일차가 열린다 — 하루를 걸러도
// 계획은 그 자리에서 기다린다.

import planData from '../data/plan-100.json'
import { graduateUnit, unitInfoMap } from './unitSrs.js'

export const TOTAL_DAYS = 100
export const PLAN_DAYS = planData.days

const UNIT_INFO = unitInfoMap(planData.days)

/** 유닛 id를 사람이 읽는 이름으로. 표에 있는 유닛만 안다. */
export function unitLabel(id) {
  const u = UNIT_INFO[id]
  if (!u) return id
  return `${u.kind === 'syntax' ? '구문' : '문법'} ${u.no} · ${u.title}`
}

/** 사이클 날의 이름 — 표의 kind를 사람이 읽는 말로. */
export const DAY_KIND_LABELS = {
  learn: '배움',
  test: '관문 시험',
  fluency: '유창성',
  produce: '말하기',
  milestone: '마일스톤',
}

/**
 * N일차의 구성. 저작된 표에서 그날의 행을 읽어 세 칸을 만든다.
 * v2 표는 10일 사이클이다 — 앞 6일 신규(learn), 뒤 4일은
 * 관문 시험·유창성·산출·마일스톤.
 */
export function dayPlan(day) {
  const d = Math.min(Math.max(1, day), TOTAL_DAYS)
  const row = planData.days[d - 1]
  const { unit = null, chapter, step = null, cycle, dayInCycle, phase } = row
  const kind = row.kind ?? 'learn'
  const isSyntax = unit?.kind === 'syntax'

  let main
  if (kind === 'learn') {
    const kindLabel = isSyntax ? '구문' : '문법'
    const unitName = `${kindLabel} ${unit.no} · ${unit.title}`
    const MAIN = {
      1: {
        label: `${unitName} — 배우기`,
        hint: isSyntax ? '앵커 장면부터 퀴즈까지 한 번에' : '설명을 읽고 연습 문항까지',
        tab: unit.kind,
        auto: 'unit-progress', // 유닛 진행이 기록되면 자동으로 체크된다
      },
      2: {
        label: `${unitName} — 되짚기`,
        hint: isSyntax ? '나머지 문항 + 어제 것 섞어서' : '연습을 섞어서 전량 다시',
        tab: unit.kind,
        auto: null,
      },
      3: {
        label: `${unitName} — 내 것으로`,
        hint: isSyntax ? '앵커 암송 — 번역만 보고 원문을' : '말하기 과제를 소리 내어',
        tab: unit.kind,
        auto: null,
      },
    }
    main = MAIN[step]
  } else if (kind === 'test') {
    main = {
      label: `관문 시험 — 지금까지 전 범위`,
      hint: '교차 출제 · 힌트 없음. 결과가 복습 간격을 조정합니다',
      tab: 'today',
      auto: null,
    }
  } else if (kind === 'fluency') {
    main = {
      label: '유창성 — 암송과 재독',
      hint: '새것 없음. 아는 것을 빠르고 매끄럽게',
      tab: 'today',
      auto: null,
    }
  } else if (kind === 'produce') {
    main = {
      label: '말하기 — 이번 사이클을 입으로',
      hint: '문법 과제와 앵커 암송을 소리 내어',
      tab: 'today',
      auto: null,
    }
  } else {
    main = {
      label: `${cycle}사이클 마무리 — 약점 되잡기`,
      hint: '새싹으로 남은 유닛을 다지고, 챕터 퀴즈로 닫습니다',
      tab: 'today',
      auto: null,
    }
  }

  // 배우는 날은 회독이 유닛의 앵커 챕터다 — 방금 배운 규칙을 그날
  // 원문에서 다시 만나야 유닛과 읽기가 한 덩어리가 된다.
  const aligned = kind === 'learn' && step <= 2 && isSyntax
  const reread = kind === 'fluency'

  return {
    day: d,
    kind,
    cycle,
    dayInCycle,
    block: cycle,
    step,
    phase,
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
      { id: 'main', ...main },
      {
        id: 'read',
        label: reread ? `${chapterLabel(chapter)}장 재독 — 빠르게` : `${chapterLabel(chapter)}장 회독`,
        hint: aligned
          ? '오늘 유닛의 앵커 장면이 이 챕터에 있습니다'
          : reread
            ? '이미 읽은 챕터 — 사전 없이 속도를 올려서'
            : '다 읽고 읽음을 누르면 체크됩니다',
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
    case 'due-zero': {
      // 밀린 카드가 많으면 20장을 넘겨도 다음 20장이 바로 '오늘 볼
      // 카드'로 채워진다. due가 0이 되기를 기다리면 단어 칸이 영원히
      // 안 끝난다 — 하루 몫은 상한만큼 채점했으면 끝난 것이다.
      if (ctx.dueCount === 0) return true
      const limit = ctx.dailyLimit ?? 20
      const today = (ctx.reviewLog ?? []).reduce(
        (n, r) => n + (sameDay(r.at) ? 1 : 0),
        0
      )
      return today >= limit
    }
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
  // 세션은 하루와 함께 닫히고, 그 밖의 계획 필드(unitSrs 등)는 살아남는다
  const { session, ...keep } = plan
  const row = planData.days[plan.day - 1]
  // 유닛의 마지막 배움 날을 마치면 복습 궤도(3→7→21일)에 오른다
  const unitSrs =
    row && row.graduates && row.unit
      ? graduateUnit(plan.unitSrs, row.unit.id, plan.day)
      : plan.unitSrs
  return {
    ...state,
    plan: {
      ...keep,
      day: Math.min(plan.day + 1, TOTAL_DAYS + 1),
      checks: {},
      history: { ...plan.history, [plan.day]: Date.now() },
      ...(unitSrs ? { unitSrs } : {}),
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
