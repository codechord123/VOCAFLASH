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
import { ensureUnitSrs, pickItems } from './unitSrs.js'

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
 * @param cycleData  사이클 날(test·fluency·produce·milestone)의 재료
 *                   {cycleUnits, pastUnits, weakUnits} — 각각 {id, kind, src, pool}
 * @param scene      콜드 오픈 대사 {en, ko, speaker} — 오늘 챕터의 명장면
 */
export function compileSession(day, { unitData, quizzes = [], mistakeDue = [], review = [], cycleData = null, scene = null }) {
  const today = dayPlan(day)
  const { unit, step, chapter, kind } = today
  const atoms = []

  // 0) 콜드 오픈 — 오늘 만날 장면의 한 줄. 수업은 영화의 밤에서 시작한다.
  if (scene) atoms.push({ type: 'scene-open', scene, chapter })

  // 1) 회수 — 어제까지 틀린 것을 먼저 되잡는다. 새것보다 먼저다.
  //    마일스톤 날은 되잡기가 본업이라 몫이 크다.
  for (const card of mistakeDue.slice(0, kind === 'milestone' ? 6 : 4)) {
    atoms.push({ type: 'warmup', card })
  }

  // 2) 누적 복습 — 끝낸 유닛이 간격을 두고 돌아온다. 전부 맞히면
  //    승급(간격이 넓어짐), 틀리면 강등(내일 다시). 새것보다 먼저다.
  //    관문 시험 날은 시험 자체가 이 역할이라 슬롯을 쉰다.
  if (kind !== 'test' && review.length > 0) {
    atoms.push({ type: 'review-head', review })
    for (const r of review) {
      for (const q of r.items) {
        const atom = r.kind === 'grammar' ? practiceAtom(r.src, q) : syntaxAtom(r.src, q)
        atoms.push({ ...atom, reviewUnit: r.unitId })
      }
    }
  }

  if (kind === 'learn') {
    if (unit?.kind === 'grammar' && unitData) {
      compileGrammar(atoms, unitData, step, day)
    } else if (unit?.kind === 'syntax' && unitData) {
      compileSyntax(atoms, unitData, quizzes, step, day)
    }
  } else if (kind === 'test') {
    compileTest(atoms, today, cycleData, day)
  } else if (kind === 'fluency') {
    compileFluency(atoms, cycleData, day)
  } else if (kind === 'produce') {
    compileProduce(atoms, cycleData, day)
  } else if (kind === 'milestone') {
    compileMilestone(atoms, today, cycleData, day)
  }

  // 간격 복습 — 단어. 카드 목록은 러너가 그 시점의 due로 채운다.
  atoms.push({ type: 'swipe' })

  // 적용 — 원문. 읽기는 리더의 일이라 여기서만 밖으로 나간다.
  atoms.push({
    type: 'read',
    chapter,
    reread: kind === 'fluency', // 유창성 날은 이미 읽은 챕터를 빠르게 다시
    deep: kind === 'milestone', // 마일스톤 날은 챕터 퀴즈까지
  })

  atoms.push({ type: 'recap' })
  return { today, atoms }
}

/** 유닛에서 오늘 몫의 시험 문항을 뽑아 원자로 만든다. */
function unitQuizAtoms(u, day, n, extraSeed = 0) {
  const items = pickItems(u.pool, day + extraSeed, (Number(u.id.replace(/\D/g, '')) || 1) * 7, n)
  return items.map((q) => ({
    ...(u.kind === 'grammar' ? practiceAtom(u.src, q) : syntaxAtom({ unitId: u.id }, q)),
    reviewUnit: u.id, // 시험·약점 문항도 유닛 SRS 판정에 실린다
  }))
}

/**
 * 관문 시험 — 이번 사이클 유닛 2문항씩 + 지난 유닛에서 채워 12문항.
 * 교차 출제라 '어느 문법을 쓸지 고르는 판별' 자체가 훈련된다.
 */
function compileTest(atoms, today, cycleData, day) {
  const { cycleUnits = [], pastUnits = [] } = cycleData ?? {}
  const picks = cycleUnits.map((u) => ({ u, n: 2 }))
  const room = Math.max(0, 12 - picks.length * 2)
  for (const u of seededShuffle(pastUnits, day).slice(0, Math.ceil(room / 2))) {
    picks.push({ u, n: 2 })
  }
  atoms.push({
    type: 'test-head',
    cycle: today.cycle,
    count: picks.reduce((s, p) => s + Math.min(p.n, p.u.pool.length), 0),
    unitIds: picks.map((p) => p.u.id),
  })
  for (const { u, n } of picks) atoms.push(...unitQuizAtoms(u, day, n))
}

/** 유창성 — 새것 없음. 앵커를 3단 은폐 섀도잉으로 몸에 붙인다. */
function compileFluency(atoms, cycleData, day) {
  const anchors = []
  for (const u of cycleData?.cycleUnits ?? []) {
    if (u.kind === 'syntax') anchors.push(...(u.src?.anchors ?? []))
  }
  atoms.push({ type: 'fluency-head' })
  for (const a of seededShuffle(anchors, day).slice(0, 3)) {
    atoms.push({ type: 'shadow', anchor: a })
  }
}

/** 산출 — 사이클의 문법 과제와 구문 앵커를 입으로. */
function compileProduce(atoms, cycleData, day) {
  atoms.push({ type: 'produce-head' })
  for (const u of cycleData?.cycleUnits ?? []) {
    if (u.kind === 'grammar') {
      for (const t of seededShuffle(u.src?.produce ?? [], day).slice(0, 2)) {
        atoms.push({ type: 'produce', task: t })
      }
    } else {
      for (const a of seededShuffle(u.src?.anchors ?? [], day).slice(0, 2)) {
        atoms.push({ type: 'recite', anchor: a })
      }
    }
  }
}

/** 마일스톤 — 새싹으로 남은 유닛을 다진다. 문항은 SRS 판정에 실린다. */
function compileMilestone(atoms, today, cycleData, day) {
  const weak = cycleData?.weakUnits ?? []
  atoms.push({ type: 'milestone-head', cycle: today.cycle, weakIds: weak.map((u) => u.id) })
  for (const u of weak) atoms.push(...unitQuizAtoms(u, day, 2, 3))
}

/** 발견 문답 — 규칙을 읽기 전에 먼저 맞혀 본다. 예측이 앞서야 설명이 박힌다. */
function discoverAtom(u, d) {
  return {
    type: 'quiz-choice',
    source: 'discover',
    unit: u,
    q: {
      q: d.q ?? '어느 쪽일까?',
      sentence: d.prompt,
      choices: d.options,
      answer: d.options[d.answerIndex],
      why: d.why ?? null,
    },
  }
}

/** 문법 유닛의 리듬. */
function compileGrammar(atoms, u, step, day) {
  if (step === 1) {
    // 배우기: 왜 → 발견 문답(먼저 맞혀 보기) → 규칙 → 갈라 보기 → 예문 → 연습 전량
    atoms.push({ type: 'rule', title: '왜 헷갈리는가', body: u.why })
    for (const d of u.discover ?? []) atoms.push(discoverAtom(u, d))
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

/**
 * 구문 1일차의 문항 선정 — 규칙마다 그 규칙에 붙은 문항 3개까지, 남는
 * 자리는 나머지에서 12개까지. 2일차가 여집합을 계산할 수 있게 분리했다.
 */
function syntaxDay1Ids(u, items) {
  const used = new Set()
  let count = 0
  for (const r of u.rules ?? []) {
    for (const q of items.filter((x) => x.relatedRuleId === r.id && !used.has(x.quizId)).slice(0, 3)) {
      used.add(q.quizId)
      count += 1
    }
  }
  for (const q of items) {
    if (count >= 12) break
    if (used.has(q.quizId)) continue
    used.add(q.quizId)
    count += 1
  }
  return used
}

/** 구문 유닛의 리듬. */
function compileSyntax(atoms, u, quizzes, step, day) {
  const items = quizzes.filter((q) => q.unitId === u.unitId)
  if (step === 1) {
    // 배우기: 앵커 장면 → 규칙 하나 → 바로 그 규칙의 문항 → 다음 규칙…
    // 규칙을 다 읽고 문항을 몰아서 푸는 게 아니라, 배운 자리에서 바로 쓴다.
    for (const a of (u.anchors ?? []).slice(0, 3)) atoms.push({ type: 'anchor', anchor: a })
    const used = new Set()
    let count = 0
    for (const r of u.rules ?? []) {
      atoms.push({ type: 'rule', title: r.title, body: r.body, trap: r.isTrap })
      for (const q of items.filter((x) => x.relatedRuleId === r.id && !used.has(x.quizId)).slice(0, 3)) {
        used.add(q.quizId)
        count += 1
        atoms.push(syntaxAtom(u, q))
      }
    }
    for (const q of items) {
      if (count >= 12) break
      if (used.has(q.quizId)) continue
      used.add(q.quizId)
      count += 1
      atoms.push(syntaxAtom(u, q))
    }
  } else if (step === 2) {
    // 되짚기: 1일차에 안 본 문항 전부 + 1일차 것 몇 개 섞어서
    const day1 = syntaxDay1Ids(u, items)
    const pool = [
      ...items.filter((q) => !day1.has(q.quizId)),
      ...seededShuffle(items.filter((q) => day1.has(q.quizId)), day).slice(0, 4),
    ]
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
      session: {
        day: plan.day, idx: 0, right: 0, total: 0, wrong: [], review: {}, speak: [],
        combo: 0, bestCombo: 0, retries: [],
      },
    },
  }
}

/** 원자 하나를 마치고 다음으로. 채점이 있었으면 결과를 싣는다. */
export function advanceSession(state, { correct = null, wrongRef = null, reviewUnit = null, speak = null, retryIdx = null } = {}) {
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
  // 콤보 — 연속 정답. 틀리면 끊긴다. 채점 없는 원자는 이어 간다.
  const combo = correct === true ? (s.combo ?? 0) + 1 : correct === false ? 0 : s.combo ?? 0
  return {
    ...state,
    plan: {
      ...state.plan,
      session: {
        ...s,
        idx: s.idx + 1,
        right: s.right + (correct === true ? 1 : 0),
        total: s.total + (correct === null ? 0 : 1),
        combo,
        bestCombo: Math.max(s.bestCombo ?? 0, combo),
        // 오답 참조만 저장한다. 카드는 정리 화면에서 한 번에 만든다.
        wrong: wrongRef ? [...s.wrong, wrongRef] : s.wrong,
        review,
        // 말하기 자평(신호등)은 따로 싣는다 — 🔴는 정리에서 카드가 된다
        speak: speak ? [...(s.speak ?? []), speak] : s.speak ?? [],
        // 틀린 문항은 수업 끝(단어 전)에 다시 나온다 — 맞혀야 하루가 닫힌다
        retries:
          retryIdx != null && (s.retries?.length ?? 0) < 12
            ? [...(s.retries ?? []), retryIdx]
            : s.retries ?? [],
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
