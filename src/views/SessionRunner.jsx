import { useEffect, useMemo, useState } from 'react'
import Swipe from './Swipe.jsx'
import { ProduceLadder, TrafficLight } from './Speak.jsx'
import ListenButton from './Listen.jsx'
import Icon, { Dot } from './Icon.jsx'
import grammarCourse from '../data/grammar-course.json'
import unitData from '../data/curriculum/units.json'
import unitQuizData from '../data/curriculum/unit-quiz.json'
import gateData from '../data/gate-quiz.json'
import midexpData from '../data/midexp.json'
import sceneLines from '../data/scene-lines.json'

// 구문 관문 문항을 quizId로 바로 찾기 위한 평탄 목록
const GATE_SYNTAX_ALL = Object.values(gateData.syntax).flat()
import { applyGrade, withProgress } from '../lib/srs.js'
import { cardsFromMidExpressions } from '../lib/deck.js'
import { exprsForDay } from '../lib/midexpPlan.js'
import { addUnitCards } from '../lib/unitCards.js'
import { DAY_KIND_LABELS, PLAN_DAYS, chapterLabel, completeDay, itemDone, sameDay, unitLabel } from '../lib/plan.js'
import { REWINDABLE, advanceSession, compileSession, endSession, pauseSession, remainingSecs, rewindSession } from '../lib/session.js'
import { addMistakeCards, cardsFromGrammarWrong, cardsFromQuizWrong, cardsFromSpeakWrong } from '../lib/mistakes.js'
import { UNIT_INTERVALS, UNIT_STAGES, applyUnitReview, buildReview } from '../lib/unitSrs.js'
import { NIGHT_STOPS, sessionGrade } from '../lib/journey.js'
import { exprFlip, firstLetters, koToEnClue } from '../lib/clue.js'

// 수업 진행기. 컴파일된 원자 수열을 한 화면씩 통과시킨다.
//
// 학습자가 하는 일은 답하고 다음을 누르는 것뿐이다. 무엇을 볼지,
// 어떤 순서로 볼지는 세션이 정한다 — 길 안내가 아니라 수업이다.
//
// 진행 위치는 저장본에 있다(plan.session.idx). 지하철에서 닫아도
// 다시 열면 그 원자에서 이어진다.

function toCycleUnit(ref) {
  const src =
    ref.kind === 'grammar'
      ? grammarCourse.units.find((x) => x.id === ref.id)
      : unitData.units.find((x) => x.unitId === ref.id)
  const pool =
    ref.kind === 'grammar'
      ? src?.practice ?? []
      : unitQuizData.quizzes.filter((q) => q.unitId === ref.id)
  // 관문 전용 풀 — 학습 흐름에 한 번도 나오지 않는, 처음 보는 문항
  const gate =
    (ref.kind === 'grammar' ? gateData.grammar[ref.id] : gateData.syntax[ref.id]) ?? []
  return { id: ref.id, kind: ref.kind, src, pool, gate }
}

/** 사이클 날(시험·유창성·산출·마일스톤)의 재료 — 표에서 유닛을 모은다. */
function buildCycleData(today, day, unitSrs, review) {
  if (today.kind === 'learn') return null
  const firstSeen = {}
  for (const r of PLAN_DAYS) {
    if (r.kind === 'learn' && r.unit && !(r.unit.id in firstSeen)) {
      firstSeen[r.unit.id] = { day: r.day, cycle: r.cycle, ref: r.unit }
    }
  }
  const cycleRefs = []
  const pastRefs = []
  for (const info of Object.values(firstSeen)) {
    if (info.day > day) continue // 아직 안 배운 유닛은 시험 범위 밖
    if (info.cycle === today.cycle) cycleRefs.push(info.ref)
    else pastRefs.push(info.ref)
  }
  // 마일스톤의 약점 몫 — 아직 새싹(srs 2)인 유닛. 오늘 복습 슬롯과 겹치지 않게.
  const reviewIds = new Set(review.map((r) => r.unitId))
  const weakRefs =
    today.kind === 'milestone'
      ? Object.entries(unitSrs ?? {})
          .filter(([id, s]) => s.srs === 2 && !reviewIds.has(id) && firstSeen[id])
          .slice(0, 3)
          .map(([id]) => firstSeen[id].ref)
      : []
  const hasPool = (x) => x.src && x.pool.length > 0
  return {
    cycleUnits: cycleRefs.map(toCycleUnit).filter((x) => x.src),
    pastUnits: pastRefs.map(toCycleUnit).filter(hasPool),
    weakUnits: weakRefs.map(toCycleUnit).filter(hasPool),
  }
}

export default function SessionRunner({ state, cards = [], dueCards, settings, commit, onGuide }) {
  const session = state.plan?.session
  const day = session?.day ?? state.plan?.day ?? 1

  // 오답 워밍업 카드는 수업을 시작한 순간의 due에서 뽑고, 그 id를 세션에
  // 저장한다. 이 화면은 잠시 멈춤·설정·읽기 왕복·새로고침마다 새로 열리는데,
  // 그때마다 due에서 다시 뽑으면 이미 채점한 카드가 빠져 목록이 짧아지고,
  // 저장된 위치(idx)가 문항 몇 개를 소리 없이 건너뛰었다. 자정을 넘기면
  // 반대로 목록이 길어져 푼 문항을 또 풀었다.
  const savedWarmups = session?.warmupIds ?? null
  const warmupKey = savedWarmups ? savedWarmups.join('|') : ''

  const compiled = useMemo(() => {
    const today = compileSession(day, { unitData: null, mistakeDue: [] }).today
    const u = today.unit
    const source = u
      ? u.kind === 'grammar'
        ? grammarCourse.units.find((x) => x.id === u.id)
        : unitData.units.find((x) => x.unitId === u.id)
      : null
    // 누적 복습 — 끝낸 유닛 중 오늘 due인 것에서 문항을 뽑는다.
    // 세션 중에는 unitSrs가 변하지 않으므로(반영은 정리에서 한 번)
    // day 고정 메모 안에서 읽어도 이어하기가 안전하다.
    const review =
      today.kind === 'test'
        ? [] // 시험 날은 시험이 복습이다
        : buildReview({
            unitSrs: state.plan?.unitSrs,
            day,
            excludeUnitId: u?.id ?? null,
            grammarUnits: grammarCourse.units,
            quizzes: unitQuizData.quizzes,
          })
    // 콜드 오픈 — 오늘 챕터의 앵커 대사 하나. 수업의 첫 화면은 영화다.
    const chapterAnchors = unitData.units
      .flatMap((x) => x.anchors ?? [])
      .filter((a) => a.chapter === Math.floor(today.chapter))
    // 그 챕터에 앵커 대사가 없으면 해설 자료에서 뽑아 둔 후보로, 그것도
    // 없으면 오늘 유닛(없으면 전체)의 대사로 — 첫 화면이 비는 날이 없게.
    // 예전에는 100일 중 40일이 장면 없이 시작했다.
    const fallback = sceneLines[String(Math.floor(today.chapter))] ?? []
    const unitAnchors =
      u?.kind === 'syntax' ? unitData.units.find((x) => x.unitId === u.id)?.anchors ?? [] : []
    const pool = chapterAnchors.length
      ? chapterAnchors
      : fallback.length
        ? fallback
        : unitAnchors.length
          ? unitAnchors
          : unitData.units.flatMap((x) => x.anchors ?? [])
    const scene = pool.length ? pool[(day * 13 + 7) % pool.length] : null
    return compileSession(day, {
      unitData: source,
      quizzes: unitQuizData.quizzes,
      mistakeDue: savedWarmups
        ? savedWarmups.map((id) => state.cards.find((c) => c.id === id)).filter(Boolean)
        : dueCards.filter((c) => c.deck === 'mistake'),
      review,
      cycleData: buildCycleData(today, day, state.plan?.unitSrs, review),
      exprs: exprsForDay(midexpData.expressions, day),
      scene,
    })
    // 날과 워밍업 목록이 같으면 다시 컴파일하지 않는다 — 이어하기의 전제다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, warmupKey])

  // 처음 연 수업이면 워밍업 목록을 세션에 고정한다
  useEffect(() => {
    if (!session || session.warmupIds) return
    const ids = compiled.atoms.filter((a) => a.type === 'warmup').map((a) => a.card.id)
    commit((s) =>
      s.plan?.session && !s.plan.session.warmupIds
        ? { ...s, plan: { ...s.plan, session: { ...s.plan.session, warmupIds: ids } } }
        : s
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.warmupIds, compiled])

  const { today } = compiled
  // 틀린 문항은 단어(스와이프) 직전에 다시 나온다 — 재도전 목록은 세션에
  // 저장되므로 중간에 닫아도 같은 자리로 복원된다.
  const base = compiled.atoms
  const swipeIdx = base.findIndex((a) => a.type === 'swipe')
  const atoms = [
    ...base.slice(0, swipeIdx),
    ...(session?.retries ?? []).map((i) => ({ ...base[i], retry: true, baseIdx: i })),
    ...base.slice(swipeIdx),
  ]
  const idx = Math.min(session?.idx ?? 0, atoms.length - 1)
  const atom = atoms[idx]
  const progress = ((idx + 1) / atoms.length) * 100
  // 앞 원자가 읽을거리일 때만 뒤로 갈 수 있다 — 문항으로 돌아가면 채점이 겹친다
  const canRewind = idx > 0 && REWINDABLE.has(atoms[idx - 1]?.type) && !atoms[idx - 1]?.retry
  // 남은 시간 어림 — 단어 몫은 오늘 이미 넘긴 장수를 빼고 센다
  const gradedToday = state.reviewLog.filter(
    (r) => sameDay(r.at) && r.via !== 'session-expr' && r.via !== 'session-warmup'
  ).length
  const swipeCards = Math.min(dueCards.length, Math.max(0, (settings?.dailyLimit ?? 20) - gradedToday))
  const minsLeft = Math.max(1, Math.round(remainingSecs(atoms, idx, { swipeCards }) / 60))

  function next(opts = {}) {
    // 문항을 틀리면 그 문항이 뒤에 다시 줄을 선다. 재도전에서 또 틀려도
    // 다시 줄을 선다 — 맞혀야 하루가 닫힌다.
    const isQuiz = atom.type === 'quiz-choice' || atom.type === 'quiz-order' || atom.type === 'quiz-listen'
    if (opts.correct === false && isQuiz) {
      const baseIdx = atom.retry ? atom.baseIdx : idx < swipeIdx ? idx : null
      if (baseIdx != null) opts = { ...opts, retryIdx: baseIdx }
    }
    // 재도전 회차는 정답률·콤보·오답 카드·유닛 판정에 다시 싣지 않는다 —
    // 첫 시도의 판정이 이미 실렸다. 틀린 뒤 맞힌 것이 1/2로 잡히면
    // 정리 화면의 밤의 등급이 실제보다 낮게 나왔다.
    if (atom.retry) opts = { ...opts, correct: null, wrongRef: null, reviewUnit: null }
    commit((s) => advanceSession(s, opts))
    window.scrollTo({ top: 0 })
  }

  /** 워밍업 카드 채점 — 스와이프와 같은 규칙으로 진짜 SRS에 반영한다. */
  function gradeWarmup(card, grade, via = 'session-warmup') {
    commit((s) => ({
      ...s,
      progress: {
        ...s.progress,
        [card.id]: (({ box, dueAt, reviewCount, lapseCount, lastReviewedAt }) => ({
          box, dueAt, reviewCount, lapseCount, lastReviewedAt,
        }))(applyGrade(withProgress(card, s.progress?.[card.id]), grade)),
      },
      reviewLog: [
        ...s.reviewLog,
        { at: Date.now(), cardId: card.id, grade, round: 1, via },
      ],
    }))
  }

  /** 정리 — 오답을 카드로 회수하고, 복습 유닛의 승급·강등을 반영하고, 하루를 닫는다. */
  function finishDay() {
    commit((s) => {
      const sess = s.plan?.session
      const wrong = sess?.wrong ?? []
      const gWrong = wrong
        .filter((w) => w.source === 'grammar')
        .map((w) => {
          const u = grammarCourse.units.find((x) => x.id === w.unitId)
          if (!u) return null
          // 관문 문항은 연습 목록에 없다 — 전용 풀에서 id로 찾는다
          const q =
            w.qIndex >= 0
              ? u.practice[w.qIndex]
              : gateData.grammar[w.unitId]?.find((x) => x.id === w.gateId)
          return q ? { u, q } : null
        })
        .filter(Boolean)
      // 구문 오답은 유닛별로 묶는다 — 복습 문항은 오늘 유닛이 아닐 수 있다
      const sWrongByUnit = new Map()
      for (const w of wrong.filter((x) => x.source === 'syntax')) {
        const q =
          unitQuizData.quizzes.find((x) => x.quizId === w.quizId) ??
          GATE_SYNTAX_ALL.find((x) => x.quizId === w.quizId)
        if (!q) continue
        // 유형마다 카드가 되는 모양이 다르다 — 틀린 그 일을 그대로
        // 다시 시키는 형태로 앞뒷면을 고른다.
        let item
        if (q.type === 'truefalse') {
          item = { kind: 'blank', en: q.prompt, answer: q.isCorrect ? '맞다' : '아니다', ko: q.explanation ?? '' }
        } else if (q.type === 'arrange' || q.type === 'koToEn') {
          item = { kind: 'order', en: q.answer.map((i) => q.chunks[i]).join(' '), ko: q.prompt }
        } else if (q.type === 'anchorRestore') {
          item = { kind: 'order', en: q.blanks.join(' · '), ko: q.text }
        } else {
          item = { kind: 'blank', en: q.prompt, answer: q.options[q.answerIndex], ko: q.explanation ?? '' }
        }
        if (!sWrongByUnit.has(q.unitId)) sWrongByUnit.set(q.unitId, [])
        sWrongByUnit.get(q.unitId).push(item)
      }

      let next = s
      for (const { u, q } of gWrong) next = addMistakeCards(next, cardsFromGrammarWrong(u, [q]))
      for (const [unitId, items] of sWrongByUnit) {
        next = addMistakeCards(next, cardsFromQuizWrong(items, { work: unitLabel(unitId) }))
      }
      // 말하기 자평 — 🔴는 카드가 되어 돌아오고, 전부 기록으로 남는다
      const speak = sess?.speak ?? []
      if (speak.length) {
        next = addMistakeCards(
          next,
          cardsFromSpeakWrong(speak.filter((x) => x.grade === 'red'))
        )
        const stamped = speak.map((x) => ({ ...x, day, at: Date.now() }))
        next = { ...next, speakLog: [...(next.speakLog ?? []), ...stamped].slice(-300) }
      }
      // 오늘의 콜드 오픈 대사를 수집첩에 넣는다 — 100일이면 100줄의 필름
      const sceneAtom = compiled.atoms.find((a) => a.type === 'scene-open')
      if (sceneAtom) {
        const q = { day, en: sceneAtom.scene.en, ko: sceneAtom.scene.ko, speaker: sceneAtom.scene.speaker ?? null }
        next = {
          ...next,
          plan: {
            ...next.plan,
            quotes: [...(next.plan?.quotes ?? []).filter((x) => x.day !== day), q].slice(-100),
          },
        }
      }
      // 관문 시험 날은 성적을 관문 기록에 남긴다 — 성장 그래프의 재료다
      if (today.kind === 'test') {
        const rv = Object.values(sess?.review ?? {})
        const right = rv.reduce((n, r) => n + r.right, 0)
        const total = rv.reduce((n, r) => n + r.total, 0)
        next = {
          ...next,
          plan: {
            ...next.plan,
            gates: {
              ...(next.plan?.gates ?? {}),
              [String(day)]: { day, cycle: today.cycle, right, total, at: Date.now() },
            },
          },
        }
      }
      // 복습 유닛 판정 — 전부 맞으면 간격이 넓어지고, 틀리면 내일 다시
      next = {
        ...next,
        plan: {
          ...next.plan,
          unitSrs: applyUnitReview(next.plan?.unitSrs, sess?.review, day),
        },
      }
      // 구문 유닛을 졸업하는 날이면 그 유닛의 복습 카드(어휘·패턴·함정)를
      // 넣는다. 예전에는 구문 탭 퀴즈에서만 들어와서, 수업만 따라가면
      // 유닛을 끝내도 카드가 한 장도 생기지 않았다.
      const row = PLAN_DAYS[day - 1]
      if (row?.graduates && row.unit?.kind === 'syntax') {
        const fronts = new Set(cards.map((c) => (c.front ?? '').trim().toLowerCase()))
        next = addUnitCards(next, row.unit.id, fronts)
      }
      return completeDay(endSession(next))
    })
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="stack stack--loose">
      <header className="stack stack--tight">
        <div className="row row--between">
          <span className="hint">
            {today.day}일차 수업 · {idx + 1}/{atoms.length}
            {/* 틀린 문항이 뒤에 줄을 서면 전체 수가 늘어난다 — 왜 늘었는지 보여 준다 */}
            {(session?.retries?.length ?? 0) > 0 && ` · 다시 ${session.retries.length}`}
            {` · 남은 약 ${minsLeft}분`}
          </span>
          <div className="row" style={{ gap: 'var(--s1)' }}>
            {canRewind && (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  commit((s) => rewindSession(s))
                  window.scrollTo({ top: 0 })
                }}
                title="앞 화면 다시 보기"
              >
                ← 이전
              </button>
            )}
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => commit((s) => pauseSession(s))}
              title="진행은 저장됩니다"
            >
              잠시 멈춤
            </button>
          </div>
        </div>
        {/* 진행바 위를 걷는 사람 — 비엔나의 밤을 한 원자씩 걸어간다 */}
        <div className="progress progress--walk">
          <div className="progress__bar" style={{ width: `${progress}%` }} />
          <span className="progress__walker" style={{ left: `calc(${progress}% - 9px)` }}>
            <Icon name={progress >= 100 ? 'sunrise' : 'walker'} size={16} />
          </span>
        </div>
      </header>

      <Atom
        key={idx}
        atom={atom}
        today={today}
        state={state}
        dueCards={dueCards}
        settings={settings}
        commit={commit}
        onGuide={onGuide}
        onNext={next}
        onGrade={gradeWarmup}
        onFinish={finishDay}
        session={session}
      />
    </div>
  )
}

function Atom({ atom, today, state, dueCards, settings, commit, onGuide, onNext, onGrade, onFinish, session }) {
  switch (atom.type) {
    case 'scene-open':
      return <SceneOpen atom={atom} today={today} onNext={onNext} />
    case 'expr':
      return <ExprAtom atom={atom} progress={state.progress} onGrade={onGrade} onNext={onNext} />
    case 'warmup':
      return <Warmup card={atom.card} onGrade={onGrade} onNext={onNext} />
    case 'review-head':
      return <ReviewHead review={atom.review} unitSrs={state.plan?.unitSrs} onNext={onNext} />
    case 'test-head':
      return <TestHead atom={atom} onNext={onNext} />
    case 'fluency-head':
      return <FluencyHead today={today} onNext={onNext} />
    case 'produce-head':
      return <ProduceHead onNext={onNext} />
    case 'milestone-head':
      return <MilestoneHead atom={atom} onNext={onNext} />
    case 'anchor':
      return <Anchor anchor={atom.anchor} onNext={onNext} />
    case 'rule':
      return <Rule atom={atom} onNext={onNext} />
    case 'points':
      return <Points points={atom.points} onNext={onNext} />
    case 'example':
      return <Example example={atom.example} onNext={onNext} />
    case 'quiz-choice':
      return <QuizChoice atom={atom} combo={session?.combo ?? 0} onNext={onNext} />
    case 'quiz-listen':
      return <ListenQuiz atom={atom} combo={session?.combo ?? 0} onNext={onNext} />
    case 'quiz-order':
      return <QuizOrder atom={atom} combo={session?.combo ?? 0} onNext={onNext} />
    case 'produce':
      return <Produce task={atom.task} onNext={onNext} />
    case 'recite':
      return <Recite anchor={atom.anchor} onNext={onNext} />
    case 'shadow':
      return <Shadow anchor={atom.anchor} onNext={onNext} />
    case 'swipe':
      return <SwipeAtom dueCards={dueCards} settings={settings} commit={commit} state={state} onNext={onNext} />
    case 'read':
      return <ReadAtom atom={atom} today={today} state={state} onGuide={onGuide} onNext={onNext} />
    case 'cando':
      return <CandoCheck atom={atom} state={state} commit={commit} onNext={onNext} />
    case 'recap':
      return <Recap today={today} session={session} unitSrs={state.plan?.unitSrs} onFinish={onFinish} />
    default:
      return null
  }
}

/** 콜드 오픈 — 오늘 챕터의 대사 한 줄. 수업의 첫 화면은 영화다. */
function SceneOpen({ atom, today, onNext }) {
  const { scene } = atom
  const stop = NIGHT_STOPS.find((s) => s.cycle === today.cycle)
  return (
    <div className="stack">
      <div className="scene">
        <div className="scene__meta">
          Day {today.day} · {stop ? stop.place : `${chapterLabel(atom.chapter)}장`}
        </div>
        <p className="scene__line">“{scene.en}”</p>
        <div className="scene__ko">{scene.ko}</div>
        {scene.speaker && <div className="scene__speaker">— {scene.speaker}</div>}
        <div className="row" style={{ justifyContent: 'center' }}>
          <ListenButton text={scene.en} label="대사 듣기" />
        </div>
      </div>
      <button className="btn btn--primary btn--block" onClick={() => onNext()}>
        오늘의 밤을 시작
      </button>
    </div>
  )
}

/**
 * 오늘의 영화 표현 — 하루 5개를 새로 들인다.
 * 상황을 보고 뜻을 먼저 떠올린 뒤 펼친다(인출 먼저). 알았음/몰랐음이
 * 그대로 SRS 첫 판정이 되어, 몰랐던 것은 내일, 알았던 것은 사흘 뒤
 * 단어 복습에 돌아온다. 처음 보는 것을 몰랐다고 틀린 것은 아니라
 * 정답률·콤보에는 넣지 않는다.
 */
function ExprAtom({ atom, progress, onGrade, onNext }) {
  const { expr, n, of } = atom
  const [open, setOpen] = useState(false)
  const card = useMemo(() => {
    const c = cardsFromMidExpressions([expr])[0]
    return withProgress(c, progress?.[c.id])
    // 이 원자에 들어선 순간의 진행으로 고정한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expr])
  const seen = (card.reviewCount ?? 0) > 0
  // 익숙해진 표현(박스 3 이상)은 뜻을 먼저 보이고 영어를 꺼내게 한다
  const flip = exprFlip(card)
  return (
    <div className="stack">
      <div className="section-title">
        오늘의 영화 표현 {n}/{of} · {expr.genre}
        {flip && ' · 뜻 보고 말하기'}
      </div>
      <div className="panel stack stack--tight" style={{ textAlign: 'center' }}>
        {flip ? (
          <>
            <p className="read" style={{ margin: 0, fontSize: 20 }}>{expr.meaning}</p>
            {!open && (
              <p className="hint" style={{ fontFamily: 'var(--font-read)', letterSpacing: '0.05em', margin: 0 }}>
                {flip.clue}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="read" style={{ margin: 0, fontSize: 22 }}>{expr.phrase}</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <ListenButton text={expr.phrase} compact />
            </div>
          </>
        )}
        {expr.situation && <p className="hint" style={{ margin: 0 }}>{expr.situation}</p>}
        {open && (
          <>
            <div className="flashcard__divider" />
            {flip ? (
              <div className="row" style={{ justifyContent: 'center', gap: 'var(--s2)' }}>
                <div className="read" style={{ fontSize: 20, color: 'var(--accent-text)' }}>{expr.phrase}</div>
                <ListenButton text={expr.phrase} compact autoPlay />
              </div>
            ) : (
              <div className="read" style={{ fontSize: 18, color: 'var(--accent-text)' }}>{expr.meaning}</div>
            )}
            {expr.example && (
              <div className="row" style={{ gap: 'var(--s2)', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <p className="read" style={{ margin: 0, fontSize: 15, textAlign: 'left', flex: 1 }}>{expr.example}</p>
                <ListenButton text={expr.example} compact />
              </div>
            )}
            {expr.translation && <div className="ko" style={{ textAlign: 'left' }}>{expr.translation}</div>}
          </>
        )}
      </div>
      {seen && !open && (
        <p className="hint" style={{ margin: 0 }}>이미 넘겨 본 표현 — 판정은 복습 일정에 반영됩니다</p>
      )}
      {open ? (
        <div className="grade-row">
          <button className="btn grade-row__again" onClick={() => { onGrade(card, 'AGAIN', 'session-expr'); onNext() }}>
            몰랐음
          </button>
          <button className="btn grade-row__good" onClick={() => { onGrade(card, 'GOOD', 'session-expr'); onNext() }}>
            알았음
          </button>
        </div>
      ) : (
        <button className="btn btn--primary btn--block" onClick={() => setOpen(true)}>
          {flip ? '소리 내어 말해 봤어요 — 펼치기' : '뜻을 떠올렸어요 — 펼치기'}
        </button>
      )}
    </div>
  )
}

/** 오답 되잡기 — 어제 틀린 것을 오늘의 첫 화면에서 다시 만난다. */
function Warmup({ card, onGrade, onNext }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="stack">
      <div className="section-title">오답 되잡기</div>
      <div className="panel stack stack--tight" style={{ textAlign: 'center' }}>
        <p className="read" style={{ margin: 0, fontSize: 20 }}>{card.front}</p>
        {/* 한→영 문장 카드는 뼈대 힌트로 단서 회상을 시킨다 */}
        {!open && koToEnClue(card) && (
          <p className="hint" style={{ fontFamily: 'var(--font-read)', letterSpacing: '0.05em', margin: 0 }}>
            {koToEnClue(card)}
          </p>
        )}
        {open && (
          <>
            <div className="flashcard__divider" />
            <div className="read" style={{ fontSize: 18 }}>{card.back?.meaningKo}</div>
            {card.back?.nuance && (
              <p className="hint" style={{ textAlign: 'left', margin: 0 }}>{card.back.nuance}</p>
            )}
          </>
        )}
      </div>
      {open ? (
        <div className="grade-row">
          <button
            className="btn grade-row__again"
            onClick={() => { onGrade(card, 'AGAIN'); onNext() }}
          >
            아직 헷갈림
          </button>
          <button
            className="btn grade-row__good"
            onClick={() => { onGrade(card, 'GOOD'); onNext() }}
          >
            이제 알겠음
          </button>
        </div>
      ) : (
        <button className="btn btn--primary btn--block" onClick={() => setOpen(true)}>
          생각했어요 — 답 보기
        </button>
      )}
    </div>
  )
}

/** 누적 복습 안내 — 어떤 유닛이 왜 돌아왔는지 한 장으로 보여 준다. */
function ReviewHead({ review, unitSrs, onNext }) {
  return (
    <div className="stack">
      <div className="section-title">돌아온 유닛</div>
      <div className="panel stack stack--tight">
        <p style={{ margin: 0 }}>
          끝낸 유닛은 사라지지 않고 간격을 두고 돌아옵니다. 오늘 문항을{' '}
          <b>전부 맞히면</b> 다음 등판이 멀어지고, 틀리면 내일 바로 다시 만납니다.
        </p>
        {review.map((r) => {
          const s = unitSrs?.[r.unitId]
          return (
            <div className="row" key={r.unitId} style={{ gap: 'var(--s2)' }}>
              <span className="chip chip--accent">{UNIT_STAGES[s?.srs ?? 2]}</span>
              <span>{unitLabel(r.unitId)} — {r.items.length}문항</span>
            </div>
          )
        })}
      </div>
      <button className="btn btn--primary btn--block" onClick={() => onNext()}>시작</button>
    </div>
  )
}

/** 관문 시험 안내 — 범위와 규칙을 밝히고 시작한다. */
function TestHead({ atom, onNext }) {
  return (
    <div className="stack">
      <div className="section-title">관문 시험 — {atom.cycle}사이클</div>
      <div className="panel stack stack--tight">
        <p style={{ margin: 0 }}>
          지금까지 배운 전 범위에서 <b>{atom.count}문항</b>이 섞여 나옵니다.
          어느 유닛의 문제인지 미리 알려 주지 않습니다 — 어떤 문법을 쓸지
          고르는 일 자체가 훈련입니다.
        </p>
        <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
          결과는 유닛별 복습 간격에 반영됩니다. 틀린 것은 오답 카드로 돌아옵니다.
        </p>
      </div>
      <button className="btn btn--primary btn--block" onClick={() => onNext()}>시험 시작</button>
    </div>
  )
}

/** 유창성 날 안내 — 새것 없음이 핵심이다. */
function FluencyHead({ today, onNext }) {
  return (
    <div className="stack">
      <div className="section-title">유창성 날</div>
      <div className="panel stack stack--tight">
        <p style={{ margin: 0 }}>
          오늘은 새것이 없습니다. 아는 것을 <b>빠르고 매끄럽게</b> 만드는
          날입니다 — 앵커 암송을 하고, 이미 읽은 {chapterLabel(today.chapter)}장을
          사전 없이 속도를 올려 다시 읽습니다.
        </p>
      </div>
      <button className="btn btn--primary btn--block" onClick={() => onNext()}>시작</button>
    </div>
  )
}

function ProduceHead({ onNext }) {
  return (
    <div className="stack">
      <div className="section-title">말하기 날</div>
      <div className="panel stack stack--tight">
        <p style={{ margin: 0 }}>
          이번 사이클에서 배운 것을 <b>입으로</b> 꺼내는 날입니다. 화면을
          보기 전에 반드시 소리 내어 말해 보세요 — 답을 보고 나서 말하는
          것은 연습이 아닙니다.
        </p>
      </div>
      <button className="btn btn--primary btn--block" onClick={() => onNext()}>시작</button>
    </div>
  )
}

function MilestoneHead({ atom, onNext }) {
  return (
    <div className="stack">
      <div className="section-title">{atom.cycle}사이클 마무리</div>
      <div className="panel stack stack--tight">
        <p style={{ margin: 0 }}>
          사이클의 마지막 날 — 틀린 것을 되잡고, 아직 새싹으로 남은 유닛을
          다집니다. 마지막에는 오늘 챕터를 퀴즈까지 깊게 읽습니다.
        </p>
        {atom.weakIds.length > 0 && (
          <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
            오늘 다지는 유닛: {atom.weakIds.map((id) => unitLabel(id)).join(' · ')}
          </p>
        )}
      </div>
      <button className="btn btn--primary btn--block" onClick={() => onNext()}>시작</button>
    </div>
  )
}

function Anchor({ anchor, onNext }) {
  return (
    <div className="stack">
      <div className="section-title">앵커 장면</div>
      <div className="panel stack stack--tight">
        <p className="read" style={{ margin: 0, fontSize: 20 }}>{anchor.en}</p>
        <div className="ko">{anchor.ko}</div>
        <div><ListenButton text={anchor.en} /></div>
        {anchor.sceneNote && (
          <p className="hint" style={{ textAlign: 'left', margin: 0 }}>{anchor.sceneNote}</p>
        )}
        {anchor.speaker && (
          <span className="chip">{anchor.speaker}{anchor.chapter ? ` · Ch ${anchor.chapter}` : ''}</span>
        )}
      </div>
      <button className="btn btn--primary btn--block" onClick={() => onNext()}>다음</button>
    </div>
  )
}

function Rule({ atom, onNext }) {
  return (
    <div className="stack">
      <div
        className="panel stack stack--tight"
        style={atom.accent ? { borderColor: 'var(--accent-border)', background: 'var(--accent-soft)' } : undefined}
      >
        <div className="section-title">{atom.trap ? '⚠ 함정' : atom.title}</div>
        {atom.trap && <h4 style={{ margin: 0 }}>{atom.title}</h4>}
        <p style={{ margin: 0 }}>{atom.body}</p>
      </div>
      <button className="btn btn--primary btn--block" onClick={() => onNext()}>다음</button>
    </div>
  )
}

function Points({ points, onNext }) {
  return (
    <div className="stack">
      <div className="section-title">갈라 보기</div>
      {points.map((p, i) => (
        <div className="panel" key={i} style={{ padding: 'var(--s3) var(--s4)' }}>{p}</div>
      ))}
      <button className="btn btn--primary btn--block" onClick={() => onNext()}>다음</button>
    </div>
  )
}

function Example({ example, onNext }) {
  return (
    <div className="stack">
      <div className="section-title">실제로 쓰인 자리</div>
      <div className="panel stack stack--tight">
        <p className="read" style={{ margin: 0, fontSize: 18 }}>{example.en}</p>
        <div className="ko">{example.ko}</div>
        <div><ListenButton text={example.en} /></div>
        <p className="hint" style={{ textAlign: 'left', margin: 0 }}>{example.note}</p>
        {example.from && <span className="chip">{example.from}</span>}
      </div>
      <button className="btn btn--primary btn--block" onClick={() => onNext()}>다음</button>
    </div>
  )
}

/**
 * 듣고 고르기 — 화면에 문장은 없고 소리만. 들어간 순간 한 번 읽어 주고,
 * 몇 번이든 다시 들을 수 있다. 고르고 나면 무슨 뜻이었는지 보여 준다.
 */
function ListenQuiz({ atom, combo = 0, onNext }) {
  const { q } = atom
  const [picked, setPicked] = useState(null)
  const correct = picked !== null && picked === q.answer
  return (
    <div className="stack">
      {atom.retry && (
        <span className="chip" style={{ alignSelf: 'flex-start' }}>다시 — 아까 틀린 것</span>
      )}
      <div className="section-title">듣고 고르기</div>
      <div className="panel stack stack--tight" style={{ alignItems: 'center', textAlign: 'center' }}>
        <p className="hint" style={{ margin: 0 }}>들리는 문장을 고르세요</p>
        <ListenButton text={q.en} autoPlay label="다시 듣기" />
      </div>
      <div className="stack stack--tight">
        {q.choices.map((c) => {
          const cls = picked === null ? '' : c === q.answer ? ' is-right' : c === picked ? ' is-wrong' : ''
          return (
            <button
              key={c}
              className={`quiz__piece quiz__piece--line${cls}`}
              disabled={picked !== null}
              onClick={() => setPicked(c)}
            >
              {c}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <div className="stack stack--tight">
          <div className={correct ? 'quiz__verdict is-right' : 'quiz__verdict is-wrong'}>
            {correct ? '알아들었습니다' : '이 문장이었습니다'}
            <ComboTag combo={combo} correct={correct} />
          </div>
          {q.ko && <p className="hint" style={{ textAlign: 'left', margin: 0 }}>{q.ko}</p>}
          <button className="btn btn--primary btn--block" onClick={() => onNext({ correct })}>
            다음
          </button>
        </div>
      )}
    </div>
  )
}

/** 연속 정답의 맛 — 3연속부터 보인다. 끊기면 조용히 사라진다. */
function ComboTag({ combo, correct }) {
  if (!correct) return null
  const n = combo + 1 // 이 문항까지의 연속
  if (n < 3) return null
  return (
    <span className="combo-pop">
      <Icon name="flame" size={14} filled /> {n}연속
    </span>
  )
}

/** 문항 — 즉시 채점, 틀리면 왜 그런지, 결과는 세션에 실린다. */
function QuizChoice({ atom, combo = 0, onNext }) {
  const { q } = atom
  const [picked, setPicked] = useState(null)
  const correct = picked !== null && picked === q.answer

  const wrongRef =
    atom.source === 'grammar'
      ? {
          source: 'grammar',
          unitId: atom.unit.id,
          qIndex: atom.unit.practice.indexOf(q),
          gateId: q.id ?? null, // 관문 문항은 연습 목록 밖에 있다
        }
      : atom.source === 'syntax'
        ? { source: 'syntax', quizId: q.quizId }
        : null // 발견 문답은 카드가 되지 않는다 — 재도전으로만 돌아온다

  return (
    <div className="stack">
      {atom.retry && (
        <span className="chip" style={{ alignSelf: 'flex-start' }}>다시 — 아까 틀린 것</span>
      )}
      {atom.source === 'discover' && !atom.retry && (
        <span className="chip chip--accent" style={{ alignSelf: 'flex-start' }}>먼저 맞혀 보기</span>
      )}
      {atom.reviewUnit && (
        <span className="chip chip--accent" style={{ alignSelf: 'flex-start' }}>
          복습 — {unitLabel(atom.reviewUnit)}
        </span>
      )}
      {q.q && <div className="section-title">{q.q}</div>}
      <p className="read" style={{ margin: 0, fontSize: 17 }}>
        {q.sentence.includes('___')
          ? (<>
              {q.sentence.split('___')[0]}
              <span className="quiz__blank">{picked ?? '______'}</span>
              {q.sentence.split('___')[1]}
            </>)
          : q.sentence}
      </p>
      <div className="quiz__bank">
        {q.choices.map((c) => {
          const stateCls = picked === null ? '' : c === q.answer ? ' is-right' : c === picked ? ' is-wrong' : ''
          return (
            <button
              key={c}
              className={`quiz__piece${stateCls}`}
              disabled={picked !== null}
              onClick={() => setPicked(c)}
            >
              {c === '-' ? '(아무것도 안 붙임)' : c}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <div className="stack stack--tight">
          <div className={correct ? 'quiz__verdict is-right' : 'quiz__verdict is-wrong'}>
            {correct ? '맞았습니다' : `정답 — ${q.answer}`}
            <ComboTag combo={combo} correct={correct} />
          </div>
          {q.why && <p className="hint" style={{ textAlign: 'left', margin: 0 }}>{q.why}</p>}
          <button
            className="btn btn--primary btn--block"
            onClick={() =>
              onNext({ correct, wrongRef: correct ? null : wrongRef, reviewUnit: atom.reviewUnit ?? null })
            }
          >
            다음
          </button>
        </div>
      )}
    </div>
  )
}

function QuizOrder({ atom, combo = 0, onNext }) {
  const { q } = atom
  const [picked, setPicked] = useState([])
  const [checked, setChecked] = useState(null)
  const shuffled = useMemo(() => {
    const out = [...q.pieces]
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }, [q])
  const remaining = [...shuffled]
  for (const p of picked) {
    const i = remaining.indexOf(p)
    if (i >= 0) remaining.splice(i, 1)
  }
  const wrongRef =
    atom.source === 'grammar'
      ? {
          source: 'grammar',
          unitId: atom.unit.id,
          qIndex: atom.unit.practice.indexOf(q),
          gateId: q.id ?? null,
        }
      : atom.source === 'syntax'
        ? { source: 'syntax', quizId: q.quizId }
        : null

  return (
    <div className="stack">
      {atom.retry && (
        <span className="chip" style={{ alignSelf: 'flex-start' }}>다시 — 아까 틀린 것</span>
      )}
      {atom.reviewUnit && (
        <span className="chip chip--accent" style={{ alignSelf: 'flex-start' }}>
          복습 — {unitLabel(atom.reviewUnit)}
        </span>
      )}
      <div className="section-title">{q.q}</div>
      <div className="ko" style={{ color: 'var(--text)' }}>{q.ko}</div>
      <div className="quiz__slot">
        {picked.length === 0 ? (
          <span className="hint">아래에서 순서대로 누르세요</span>
        ) : (
          picked.map((p, i) => (
            <button key={`${p}-${i}`} className="quiz__piece is-picked" disabled={Boolean(checked)}
              onClick={() => setPicked(picked.filter((_, j) => j !== i))}>{p}</button>
          ))
        )}
      </div>
      {remaining.length > 0 && (
        <div className="quiz__bank">
          {remaining.map((p, i) => (
            <button key={`${p}-${i}`} className="quiz__piece" disabled={Boolean(checked)}
              onClick={() => setPicked([...picked, p])}>{p}</button>
          ))}
        </div>
      )}
      {!checked ? (
        <button className="btn btn--primary btn--block" disabled={picked.length !== q.answer.length}
          onClick={() => setChecked({ correct: picked.every((p, i) => p === q.answer[i]) })}>
          확인
        </button>
      ) : (
        <div className="stack stack--tight">
          <div className={checked.correct ? 'quiz__verdict is-right' : 'quiz__verdict is-wrong'}>
            {checked.correct ? '맞았습니다' : `정답 — ${q.answer.join(' ')}`}
            <ComboTag combo={combo} correct={checked.correct} />
          </div>
          {q.why && <p className="hint" style={{ textAlign: 'left', margin: 0 }}>{q.why}</p>}
          <button className="btn btn--primary btn--block"
            onClick={() =>
              onNext({
                correct: checked.correct,
                wrongRef: checked.correct ? null : wrongRef,
                reviewUnit: atom.reviewUnit ?? null,
              })
            }>
            다음
          </button>
        </div>
      )}
    </div>
  )
}

/** 말하기 — 3단 사다리(문법 탭과 같은 것). 자평은 세션에 실려 정리에서 기록된다. */
function Produce({ task, onNext }) {
  return (
    <ProduceLadder
      task={task}
      onGraded={(grade) =>
        onNext({ speak: { kind: 'produce', en: task.model, ko: task.ko ?? task.situation, grade } })
      }
    />
  )
}

/** 암송 — 번역을 보고 원문을 입으로 되살린 뒤 대조한다. */
function Recite({ anchor, onNext }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="stack">
      <div className="section-title">앵커 암송</div>
      <div className="panel stack stack--tight" style={{ textAlign: 'center' }}>
        <div className="ko" style={{ color: 'var(--text)', fontSize: 17 }}>{anchor.ko}</div>
        {open && (
          <>
            <div className="flashcard__divider" />
            <p className="read" style={{ margin: 0, fontSize: 19 }}>{anchor.en}</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <ListenButton text={anchor.en} autoPlay label="다시 듣기" />
            </div>
          </>
        )}
      </div>
      {open ? (
        <TrafficLight
          onPick={(grade) =>
            onNext({ speak: { kind: 'recite', en: anchor.en, ko: anchor.ko, grade } })
          }
        />
      ) : (
        <button className="btn btn--block" onClick={() => setOpen(true)}>
          영어로 말해 봤어요 — 원문 보기
        </button>
      )}
    </div>
  )
}

/**
 * 섀도잉 3단 은폐 — 같은 문장을 ①전문 보며 낭송 → ②첫 글자만 보고
 * → ③한국어만 보고 재현한다. 은폐가 깊어질수록 인출이 깊어진다.
 */
function Shadow({ anchor, onNext }) {
  const [stage, setStage] = useState(0)
  const STAGES = ['① 듣고 따라 말하기', '② 첫 글자만 보고', '③ 한국어만 보고']
  return (
    <div className="stack">
      <div className="section-title">섀도잉 — {STAGES[Math.min(stage, 2)]}</div>
      <div className="panel stack stack--tight" style={{ textAlign: 'center' }}>
        {stage === 0 && (
          <>
            <p className="read" style={{ margin: 0, fontSize: 19 }}>{anchor.en}</p>
            {/* 섀도잉은 원래 소리를 그림자처럼 따라가는 것 — 듣는 소리가 먼저다 */}
            <div className="row" style={{ justifyContent: 'center' }}>
              <ListenButton text={anchor.en} autoPlay label="다시 듣기" />
            </div>
          </>
        )}
        {stage === 1 && (
          <p className="read" style={{ margin: 0, fontSize: 19, letterSpacing: '0.06em' }}>
            {firstLetters(anchor.en)}
          </p>
        )}
        {stage >= 2 && <div className="ko" style={{ color: 'var(--text)', fontSize: 17 }}>{anchor.ko}</div>}
        {stage === 3 && (
          <>
            <div className="flashcard__divider" />
            <p className="read" style={{ margin: 0, fontSize: 19 }}>{anchor.en}</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <ListenButton text={anchor.en} autoPlay label="원어민처럼 들어 보기" />
            </div>
          </>
        )}
        {stage < 2 && <div className="ko">{anchor.ko}</div>}
      </div>
      {stage < 2 && (
        <button className="btn btn--primary btn--block" onClick={() => setStage(stage + 1)}>
          {stage === 0 ? '따라 말했어요 — 다음 단계' : '소리 내어 읽었어요 — 다음 단계'}
        </button>
      )}
      {stage === 2 && (
        <button className="btn btn--primary btn--block" onClick={() => setStage(3)}>
          영어로 재현했어요 — 원문 대조
        </button>
      )}
      {stage === 3 && (
        <TrafficLight
          onPick={(grade) =>
            onNext({ speak: { kind: 'shadow', en: anchor.en, ko: anchor.ko, grade } })
          }
        />
      )}
    </div>
  )
}

/** 단어 — 기존 스와이프를 세션 안에 그대로 얹는다. */
function SwipeAtom({ dueCards, settings, commit, state, onNext }) {
  // 이 원자에 들어선 순간의 묶음으로 고정한다
  const gradedToday = state.reviewLog.filter(
    (r) => sameDay(r.at) && r.via !== 'session-expr' && r.via !== 'session-warmup'
  ).length
  const quota = settings?.dailyLimit ?? 20
  // 오늘 이미 넘긴 만큼은 빼고 남은 몫만 — 하루 상한을 넘기지 않는다
  const [cards] = useState(() => dueCards.slice(0, Math.max(0, quota - gradedToday)))

  if (cards.length === 0 || gradedToday >= quota) {
    return (
      <div className="stack">
        <div className="empty">
          <div className="empty__icon">✓</div>
          <div className="empty__title">오늘 단어 몫은 끝났습니다</div>
          <p className="empty__body">오늘 {gradedToday}장을 넘겼습니다.</p>
        </div>
        <button className="btn btn--primary btn--block" onClick={() => onNext()}>다음</button>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="section-title">단어 — 오늘 {cards.length}장</div>
      <Swipe
        cards={cards}
        settings={settings}
        commit={commit}
        onExit={() => onNext()}
      />
    </div>
  )
}

/** 읽기 — 세션에서 유일하게 밖으로 나가는 원자. 리더가 읽기의 집이다. */
function ReadAtom({ atom, today, state, onGuide, onNext }) {
  const readDone = itemDone(
    { auto: 'read-today', chapter: atom.chapter },
    state.plan,
    { reads: state.reads }
  )
  const quizDone =
    !atom.deep ||
    itemDone({ auto: 'chapter-quiz' }, state.plan, { quizLog: state.quizLog, chapter: atom.chapter })

  return (
    <div className="stack">
      <div className="section-title">
        {atom.reread ? '재독' : '원문 적용'} — {chapterLabel(atom.chapter)}장
      </div>
      <div className="panel stack stack--tight">
        <p style={{ margin: 0 }}>
          {atom.reread
            ? '이미 읽은 챕터입니다. 사전 없이, 지난번보다 빠르게 — 속도가 유창성입니다. 다 읽고 '
            : '방금 배운 것을 원문에서 다시 만납니다. 다 읽고 '}
          <b>읽음</b>을 누르면 이 화면이 알아챕니다.
          {atom.deep && ' 오늘은 마무리 날 — 맨 아래 챕터 퀴즈까지 풀어 주세요.'}
        </p>
        {atom.reread &&
          (() => {
            const last = state.reads?.[`before-sunrise-c${atom.chapter}`]?.lastSecs
            if (!last) return null
            const m = Math.floor(last / 60)
            return (
              <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
                지난 기록 {m > 0 ? `${m}분 ${Math.round(last % 60)}초` : `${last}초`} —
                오늘은 그보다 빠르게.
              </p>
            )
          })()}
        <div className="row" style={{ gap: 'var(--s2)' }}>
          <span className={`chip${readDone ? ' chip--accent' : ''}`}>{readDone ? '✓ 읽음' : '읽기 전'}</span>
          {atom.deep && (
            <span className={`chip${quizDone ? ' chip--accent' : ''}`}>{quizDone ? '✓ 퀴즈' : '퀴즈 전'}</span>
          )}
        </div>
      </div>
      {readDone && quizDone ? (
        <button className="btn btn--primary btn--block" onClick={() => onNext()}>다음</button>
      ) : (
        <button
          className="btn btn--primary btn--block"
          onClick={() =>
            onGuide(
              { id: 'read', tab: 'read', chapter: atom.chapter },
              today
            )
          }
        >
          {chapterLabel(atom.chapter)}장 읽으러 가기
        </button>
      )}
      {/* 읽기 자료는 1MB쯤이라 지하철 약한 신호에서 못 받을 수 있다. 그때
          하루가 여기서 멈추면 안 된다 — 오늘은 넘기고, 회독은 기록하지 않는다. */}
      {!(readDone && quizDone) && (
        <button className="btn btn--ghost btn--block" onClick={() => onNext()}>
          오늘은 못 읽음 — 넘기기
        </button>
      )}
    </div>
  )
}

/**
 * can-do 자가 점검 — 부(部)가 끝나는 날, 성장을 수행의 언어로 묻는다.
 * 정직하게 고르는 것이 목적이라 전부 체크할 필요가 없다. '아직'도 기록이다.
 */
function CandoCheck({ atom, state, commit, onNext }) {
  const { cando } = atom
  const saved = state.plan?.cando?.[cando.day]?.checks
  const [checks, setChecks] = useState(() => saved ?? cando.items.map(() => null))
  const answered = checks.every((c) => c !== null)

  function save() {
    commit((s) => ({
      ...s,
      plan: {
        ...s.plan,
        cando: {
          ...(s.plan?.cando ?? {}),
          [cando.day]: { checks, at: Date.now() },
        },
      },
    }))
    onNext()
  }

  return (
    <div className="stack">
      <div className="section-title">can-do 점검 — {cando.phase}</div>
      <div className="panel stack stack--tight">
        <p style={{ margin: 0 }}>
          여기까지 왔다면 할 수 있어야 하는 것들입니다. <b>정직하게</b> 고르세요 —
          '아직'이라고 답한 것이 다음 복습의 재료가 됩니다.
        </p>
      </div>
      {cando.items.map((it, i) => (
        <div className="panel stack stack--tight" key={i} style={{ padding: 'var(--s3) var(--s4)' }}>
          <p style={{ margin: 0, fontSize: 14 }}>{it}</p>
          <div className="row" style={{ gap: 'var(--s2)' }}>
            <button
              className={`btn btn--sm${checks[i] === true ? ' btn--primary' : ''}`}
              onClick={() => setChecks(checks.map((c, j) => (j === i ? true : c)))}
            >
              할 수 있다
            </button>
            <button
              className={`btn btn--sm${checks[i] === false ? ' btn--primary' : ''}`}
              onClick={() => setChecks(checks.map((c, j) => (j === i ? false : c)))}
            >
              아직
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn--primary btn--block" disabled={!answered} onClick={save}>
        기록하고 다음
      </button>
    </div>
  )
}

function Recap({ today, session, unitSrs, onFinish }) {
  const acc = session?.total ? Math.round((session.right / session.total) * 100) : null
  const reviewed = Object.entries(session?.review ?? {})
  const grade = sessionGrade(acc, session?.bestCombo ?? 0)
  return (
    <div className="stack">
      <div className="section-title">오늘 정리</div>
      {grade && (
        <div className="scene scene--grade">
          <div className="scene__meta">Day {today.day}</div>
          <p className="scene__line" style={{ fontSize: 22 }}>{grade.title}</p>
          <div className="scene__ko">{grade.line}</div>
          {(session?.bestCombo ?? 0) >= 3 && (
            <div className="scene__speaker"><Icon name="flame" size={14} filled /> 최고 {session.bestCombo}연속 정답</div>
          )}
        </div>
      )}
      <div className="panel stack stack--tight">
        <h4 style={{ margin: 0 }}>
          {today.day}일차 —{' '}
          {today.kind === 'learn'
            ? `${today.unit.kind === 'syntax' ? '구문' : '문법'} ${today.unit.no} · ${today.unit.title}`
            : `${today.cycle}사이클 · ${DAY_KIND_LABELS[today.kind]}`}
        </h4>
        {acc !== null && (
          <p style={{ margin: 0 }}>
            문항 {session.total}개 중 {session.right}개 ({acc}%)
            {session.wrong.length > 0 &&
              ` — 틀린 ${session.wrong.length}개는 카드가 되어 내일 아침에 돌아옵니다.`}
          </p>
        )}
        {(session?.speak?.length ?? 0) > 0 && (
          <p style={{ margin: 0 }}>
            말하기 {session.speak.length}개 — <Dot tone="green" />{' '}
            {session.speak.filter((x) => x.grade === 'green').length} · <Dot tone="yellow" />{' '}
            {session.speak.filter((x) => x.grade === 'yellow').length} · <Dot tone="red" />{' '}
            {session.speak.filter((x) => x.grade === 'red').length}
            {session.speak.some((x) => x.grade === 'red') && " ('못 했다'는 카드로 돌아옵니다)"}
          </p>
        )}
        <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
          {today.phase} ·{' '}
          {today.kind === 'learn'
            ? `${['배우기', '되짚기', '내 것으로'][today.step - 1]}까지 마쳤습니다.`
            : `${today.cycle}사이클 ${today.dayInCycle}/10일을 마쳤습니다.`}
        </p>
      </div>
      {reviewed.length > 0 && (
        <div className="panel stack stack--tight">
          <div className="section-title">돌아온 유닛 판정</div>
          {reviewed.map(([id, r]) => {
            const ok = r.right === r.total
            const cur = unitSrs?.[id]?.srs ?? 2
            const nextStage = ok ? Math.min(cur + 1, 5) : Math.max(cur - 1, 2)
            return (
              <p key={id} style={{ margin: 0 }}>
                {unitLabel(id)} — {r.right}/{r.total}{' '}
                {ok
                  ? `✓ ${UNIT_STAGES[nextStage]}(으)로 승급, ${UNIT_INTERVALS[nextStage]}일 뒤에 다시`
                  : '✗ 내일 바로 다시 돌아옵니다'}
              </p>
            )
          })}
        </div>
      )}
      <button className="btn btn--primary btn--block" onClick={onFinish}>
        {today.day}일차 마치기 → 다음 날
      </button>
    </div>
  )
}
