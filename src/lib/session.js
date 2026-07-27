// 세션 엔진 — 하루치를 하나의 수업으로 컴파일한다.
//
// 예전 '오늘'은 길 안내였다. 체크리스트가 각 탭으로 보내 주면 학습은
// 거기서 알아서 하는 구조 — 계획은 있는데 수업이 없었다. 여기서는
// 하루가 활동 원자(atom)의 수열로 컴파일되고, 학습자는 화면 안에서
// 다음만 누르며 그 수열을 통과한다.
//
// 수열의 뼈대는 학습과학의 검증된 순서다:
//   회수(오답 되잡기) → 제시(앵커·규칙) → 인출(문항, 즉시 채점)
//   → 간격 복습(단어) → 적용(원문 읽기) → 정리(요약)
//
// 원자는 데이터일 뿐이다. 렌더링은 SessionRunner가 하고, 진행 위치는
// 저장본에 남아 중간에 닫아도 그 자리에서 이어진다.

import { PLAN_DAYS, dayPlan } from './plan.js'
import { ensureUnitSrs } from './unitSrs.js'

/** 결정적 셔플. 같은 날 안에서는 순서가 유지되어야 이어하기가 성립한다. */
function seededShuffle(items, seed) {
  const out = [...items]
  let s = seed
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 하루를 원자 수열로 컴파일한다.
 *
 * @param day        일차
 * @param unitData   그날 유닛의 원자료 (문법: course 유닛 / 구문: units.json 유닛)
 * @param quizzes    구문 유닛의 퀴즈 문항 (문법이면 [])
 * @param mistakeDue 오늘 due인 오답 카드
 * @param review     누적 복습 몫 — unitSrs.buildReview의 결과
 */
export function compileSession(day, { unitData, quizzes = [], mistakeDue = [], review = [] }) {
  const today = dayPlan(day)
  const { unit, step, chapter } = today
  const atoms = []

  // 1) 회수 — 어제까지 틀린 것을 먼저 되잡는다. 새것보다 먼저다.
  for (const card of mistakeDue.slice(0, 4)) {
    atoms.push({ type: 'warmup', card })
  }

  // 2) 누적 복습 — 끝낸 유닛이 간격을 두고 돌아온다. 전부 맞히면
  //    승급(간격이 넓어짐), 틀리면 강등(내일 다시). 새것보다 먼저다.
  if (review.length > 0) {
    atoms.push({ type: 'review-head', review })
    for (const r of review) {
      for (const q of r.items) {
        const atom = r.kind === 'grammar' ? practiceAtom(r.src, q) : syntaxAtom(r.src, q)
        atoms.push({ ...atom, reviewUnit: r.unitId })
      }
    }
  }

  if (unit.kind === 'grammar' && unitData) {
    compileGrammar(atoms, unitData, step, day)
  } else if (unit.kind === 'syntax' && unitData) {
    compileSyntax(atoms, unitData, quizzes, step, day)
  }

  // 간격 복습 — 단어. 카드 목록은 러너가 그 시점의 due로 채운다.
  atoms.push({ type: 'swipe' })

  // 적용 — 원문. 읽기는 리더의 일이라 여기서만 밖으로 나간다.
  atoms.push({
    type: 'read',
    chapter,
    deep: step === 4, // 정리 날은 챕터 퀴즈까지
  })

  atoms.push({ type: 'recap' })
  return { today, atoms }
}

/** 문법 유닛의 4일 리듬. */
function compileGrammar(atoms, u, step, day) {
  if (step === 1) {
    // 배우기: 왜 → 규칙 → 갈라 보기 → 예문 → 연습 전량
    atoms.push({ type: 'rule', title: '왜 헷갈리는가', body: u.why })
    atoms.push({ type: 'rule', title: '규칙', body: u.present.rule, accent: true })
    atoms.push({ type: 'points', points: u.present.points })
    for (const e of u.present.examples) atoms.push({ type: 'example', example: e })
    for (const q of u.practice) atoms.push(practiceAtom(u, q))
  } else if (step === 2) {
    // 되짚기: 규칙 한 장 다시, 연습을 섞어서 전량
    atoms.push({ type: 'rule', title: '규칙 — 다시 한 번', body: u.present.rule, accent: true })
    for (const q of seededShuffle(u.practice, day)) atoms.push(practiceAtom(u, q))
  } else if (step === 3) {
    // 내 것으로: 말하기 과제
    atoms.push({ type: 'rule', title: '규칙', body: u.present.rule, accent: true })
    for (const p of u.produce) atoms.push({ type: 'produce', task: p })
  }
  // step 4(정리)는 유닛 원자 없음 — 회수·단어·깊은 읽기로 하루를 채운다
}

/** 구문 유닛의 4일 리듬. */
function compileSyntax(atoms, u, quizzes, step, day) {
  const items = quizzes.filter((q) => q.unitId === u.unitId)
  if (step === 1) {
    // 배우기: 앵커 장면 → 규칙 → 문항 앞 절반
    for (const a of (u.anchors ?? []).slice(0, 3)) atoms.push({ type: 'anchor', anchor: a })
    for (const r of u.rules ?? []) atoms.push({ type: 'rule', title: r.title, body: r.body, trap: r.isTrap })
    for (const q of items.slice(0, 10)) atoms.push(syntaxAtom(u, q))
  } else if (step === 2) {
    // 되짚기: 문항 뒤 절반 + 앞 절반에서 섞어 몇 개
    const pool = [...items.slice(10), ...seededShuffle(items.slice(0, 10), day).slice(0, 4)]
    for (const q of pool) atoms.push(syntaxAtom(u, q))
  } else if (step === 3) {
    // 내 것으로: 앵커 암송 — 번역을 보고 원문을 떠올린다
    for (const a of (u.anchors ?? []).slice(0, 4)) atoms.push({ type: 'recite', anchor: a })
    for (const q of seededShuffle(items, day + 7).slice(0, 6)) atoms.push(syntaxAtom(u, q))
  }
}

function practiceAtom(u, q) {
  return { type: q.kind === 'order' ? 'quiz-order' : 'quiz-choice', source: 'grammar', unit: u, q }
}

/**
 * 구문 퀴즈 여섯 유형을 세션 원자로 번역한다. 전부 탭으로 풀린다.
 *   meaning·blank    보기 고르기
 *   truefalse        맞다/아니다 — 해설이 본체다
 *   arrange·koToEn   조각 배열
 *   anchorRestore    빈칸 여러 개 — 순서대로 조각을 올리는 배열로 푼다
 */
function syntaxAtom(u, q) {
  const base = { source: 'syntax', unit: u }
  if (q.type === 'truefalse') {
    return {
      type: 'quiz-choice',
      ...base,
      q: {
        sentence: q.prompt,
        choices: ['맞다', '아니다'],
        answer: q.isCorrect ? '맞다' : '아니다',
        why: q.explanation ?? null,
        quizId: q.quizId,
      },
    }
  }
  if (q.type === 'arrange' || q.type === 'koToEn') {
    const answer = q.answer.map((i) => q.chunks[i])
    return {
      type: 'quiz-order',
      ...base,
      q: { q: q.prompt, ko: '', pieces: [...q.chunks], answer, why: q.explanation ?? null, quizId: q.quizId },
    }
  }
  if (q.type === 'anchorRestore') {
    return {
      type: 'quiz-order',
      ...base,
      q: {
        q: q.prompt,
        ko: q.text, // 빈칸 뚫린 원문을 문제 지문으로 보여준다
        pieces: [...q.blanks],
        answer: [...q.blanks],
        why: q.explanation ?? null,
        quizId: q.quizId,
      },
    }
  }
  // meaning · blank
  return {
    type: 'quiz-choice',
    ...base,
    q: {
      sentence: q.prompt,
      choices: q.options,
      answer: q.options[q.answerIndex],
      why: q.explanation ?? null,
      quizId: q.quizId,
    },
  }
}

// ── 세션 상태 (저장본의 plan.session) ────────────────────────────────

export function startSession(state) {
  // 예전 저장본에는 유닛 SRS가 없다 — 이미 블록을 마친 유닛을 궤도에 올린다
  const plan = ensureUnitSrs(state.plan ?? { day: 1, checks: {}, history: {} }, PLAN_DAYS)
  return {
    ...state,
    plan: {
      ...plan,
      session: { day: plan.day, idx: 0, right: 0, total: 0, wrong: [], review: {} },
    },
  }
}

/** 원자 하나를 마치고 다음으로. 채점이 있었으면 결과를 싣는다. */
export function advanceSession(state, { correct = null, wrongRef = null, reviewUnit = null } = {}) {
  const s = state.plan?.session
  if (!s) return state
  // 복습 문항이면 유닛별 성적을 따로 모은다 — 승급·강등의 판정 재료다
  const review =
    reviewUnit && correct !== null
      ? {
          ...(s.review ?? {}),
          [reviewUnit]: {
            right: (s.review?.[reviewUnit]?.right ?? 0) + (correct ? 1 : 0),
            total: (s.review?.[reviewUnit]?.total ?? 0) + 1,
          },
        }
      : s.review ?? {}
  return {
    ...state,
    plan: {
      ...state.plan,
      session: {
        ...s,
        idx: s.idx + 1,
        right: s.right + (correct === true ? 1 : 0),
        total: s.total + (correct === null ? 0 : 1),
        // 오답 참조만 저장한다. 카드는 정리 화면에서 한 번에 만든다.
        wrong: wrongRef ? [...s.wrong, wrongRef] : s.wrong,
        review,
      },
    },
  }
}

/** 잠시 멈춤 — 진행(idx)은 그대로 두고 개요 화면으로 돌아간다. */
export function pauseSession(state, paused = true) {
  const s = state.plan?.session
  if (!s) return state
  return { ...state, plan: { ...state.plan, session: { ...s, paused } } }
}

export function endSession(state) {
  if (!state.plan?.session) return state
  const { session, ...plan } = state.plan
  return { ...state, plan }
}
