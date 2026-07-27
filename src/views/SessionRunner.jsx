import { useMemo, useState } from 'react'
import Swipe from './Swipe.jsx'
import grammarCourse from '../data/grammar-course.json'
import unitData from '../data/curriculum/units.json'
import unitQuizData from '../data/curriculum/unit-quiz.json'
import { applyGrade } from '../lib/srs.js'
import { DAY_KIND_LABELS, PLAN_DAYS, chapterLabel, completeDay, itemDone, sameDay, unitLabel } from '../lib/plan.js'
import { advanceSession, compileSession, endSession, pauseSession } from '../lib/session.js'
import { addMistakeCards, cardsFromGrammarWrong, cardsFromQuizWrong, cardsFromSpeakWrong } from '../lib/mistakes.js'
import { UNIT_INTERVALS, UNIT_STAGES, applyUnitReview, buildReview } from '../lib/unitSrs.js'
import { NIGHT_STOPS, sessionGrade } from '../lib/journey.js'

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
  return { id: ref.id, kind: ref.kind, src, pool }
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

export default function SessionRunner({ state, dueCards, settings, commit, onGuide }) {
  const session = state.plan?.session
  const day = session?.day ?? state.plan?.day ?? 1

  // 오답 워밍업 카드는 세션이 시작된 시점의 due에서 뽑되, 매 렌더마다
  // 다시 뽑으면 채점 순간 목록이 흔들린다 — 컴파일 결과를 고정한다.
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
    const scene =
      chapterAnchors.length > 0
        ? chapterAnchors[(day * 13 + 7) % chapterAnchors.length]
        : null
    return compileSession(day, {
      unitData: source,
      quizzes: unitQuizData.quizzes,
      mistakeDue: dueCards.filter((c) => c.deck === 'mistake'),
      review,
      cycleData: buildCycleData(today, day, state.plan?.unitSrs, review),
      scene,
    })
    // day가 같으면 다시 컴파일하지 않는다 — 이어하기의 전제다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])

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

  function next(opts = {}) {
    // 문항을 틀리면 그 문항이 뒤에 다시 줄을 선다. 재도전에서 또 틀려도
    // 다시 줄을 선다 — 맞혀야 하루가 닫힌다.
    const isQuiz = atom.type === 'quiz-choice' || atom.type === 'quiz-order'
    if (opts.correct === false && isQuiz) {
      const baseIdx = atom.retry ? atom.baseIdx : idx < swipeIdx ? idx : null
      if (baseIdx != null) opts = { ...opts, retryIdx: baseIdx }
    }
    // 재도전 회차는 통계·오답 카드·유닛 판정에 다시 싣지 않는다 —
    // 첫 시도의 판정이 이미 실렸다.
    if (atom.retry) opts = { ...opts, wrongRef: null, reviewUnit: null }
    commit((s) => advanceSession(s, opts))
    window.scrollTo({ top: 0 })
  }

  /** 워밍업 카드 채점 — 스와이프와 같은 규칙으로 진짜 SRS에 반영한다. */
  function gradeWarmup(card, grade) {
    commit((s) => ({
      ...s,
      progress: {
        ...s.progress,
        [card.id]: (({ box, dueAt, reviewCount, lapseCount, lastReviewedAt }) => ({
          box, dueAt, reviewCount, lapseCount, lastReviewedAt,
        }))(applyGrade(card, grade)),
      },
      reviewLog: [
        ...s.reviewLog,
        { at: Date.now(), cardId: card.id, grade, round: 1, via: 'session-warmup' },
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
          return u && { u, q: u.practice[w.qIndex] }
        })
        .filter(Boolean)
      // 구문 오답은 유닛별로 묶는다 — 복습 문항은 오늘 유닛이 아닐 수 있다
      const sWrongByUnit = new Map()
      for (const w of wrong.filter((x) => x.source === 'syntax')) {
        const q = unitQuizData.quizzes.find((x) => x.quizId === w.quizId)
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
          </span>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => commit((s) => pauseSession(s))}
            title="진행은 저장됩니다"
          >
            잠시 멈춤
          </button>
        </div>
        <div className="progress">
          <div className="progress__bar" style={{ width: `${progress}%` }} />
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
      </div>
      <button className="btn btn--primary btn--block" onClick={() => onNext()}>
        오늘의 밤을 시작
      </button>
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
            onClick={() => { onGrade(card, 'AGAIN'); onNext({ correct: false }) }}
          >
            아직 헷갈림
          </button>
          <button
            className="btn grade-row__good"
            onClick={() => { onGrade(card, 'GOOD'); onNext({ correct: true }) }}
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
        <p className="hint" style={{ textAlign: 'left', margin: 0 }}>{example.note}</p>
        {example.from && <span className="chip">{example.from}</span>}
      </div>
      <button className="btn btn--primary btn--block" onClick={() => onNext()}>다음</button>
    </div>
  )
}

/** 연속 정답의 맛 — 3연속부터 보인다. 끊기면 조용히 사라진다. */
function ComboTag({ combo, correct }) {
  if (!correct) return null
  const n = combo + 1 // 이 문항까지의 연속
  if (n < 3) return null
  return <span className="combo-pop">🔥 {n}연속</span>
}

/** 문항 — 즉시 채점, 틀리면 왜 그런지, 결과는 세션에 실린다. */
function QuizChoice({ atom, combo = 0, onNext }) {
  const { q } = atom
  const [picked, setPicked] = useState(null)
  const correct = picked !== null && picked === q.answer

  const wrongRef =
    atom.source === 'grammar'
      ? { source: 'grammar', unitId: atom.unit.id, qIndex: atom.unit.practice.indexOf(q) }
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
      ? { source: 'grammar', unitId: atom.unit.id, qIndex: atom.unit.practice.indexOf(q) }
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

/**
 * 신호등 자평 — 마이크 없이 발화를 책임화하는 최소 장치.
 * 모범과 대조한 뒤 스스로 세 단계로 판정한다. 🔴는 카드가 되어 돌아온다.
 */
function TrafficLight({ onPick }) {
  return (
    <div className="stack stack--tight">
      <p className="hint" style={{ margin: 0 }}>모범과 비교해서 — 솔직하게. 🔴는 카드가 되어 돌아옵니다.</p>
      <div className="grade-row">
        <button className="btn grade-row__again" onClick={() => onPick('red')}>
          🔴 못 했다
        </button>
        <button className="btn" onClick={() => onPick('yellow')}>
          🟡 버벅였다
        </button>
        <button className="btn grade-row__good" onClick={() => onPick('green')}>
          🟢 막힘없이
        </button>
      </div>
    </div>
  )
}

/**
 * 말하기 — 3단 사다리. ①뜻만 보고 입으로 시도 → ②모범을 청크로 조립
 * → ③모범 대조 후 가리고 한 번 더, 신호등 자평.
 * 규칙 읽기에서 자유 발화로 바로 점프하던 자리에 계단을 놓는다.
 */
function Produce({ task, onNext }) {
  const [stage, setStage] = useState(0)
  const [picked, setPicked] = useState([])
  const shuffled = useMemo(() => {
    const out = [...task.chunks]
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }, [task])
  const remaining = shuffled.filter((c) => !picked.includes(c))
  const assembled = picked.length === task.chunks.length
  const assembledRight = assembled && picked.every((c, i) => c === task.chunks[i])

  return (
    <div className="stack">
      <div className="section-title">
        말하기 — {['① 뜻만 보고 시도', '② 뼈대 조립', '③ 대조하고 한 번 더'][stage]}
      </div>
      <div className="panel stack stack--tight">
        <p style={{ margin: 0 }}>{task.situation}</p>
        {task.ko && <div className="ko" style={{ color: 'var(--text)' }}>{task.ko}</div>}

        {stage === 1 && (
          <>
            <div className="quiz__slot">
              {picked.length === 0 ? (
                <span className="hint">문장의 뼈대를 순서대로 누르세요</span>
              ) : (
                picked.map((c, i) => (
                  <button key={c} className="quiz__piece is-picked"
                    onClick={() => setPicked(picked.filter((_, j) => j !== i))}>{c}</button>
                ))
              )}
            </div>
            {remaining.length > 0 && (
              <div className="quiz__bank">
                {remaining.map((c) => (
                  <button key={c} className="quiz__piece" onClick={() => setPicked([...picked, c])}>{c}</button>
                ))}
              </div>
            )}
            {assembled && (
              <div className={assembledRight ? 'quiz__verdict is-right' : 'quiz__verdict is-wrong'}>
                {assembledRight ? '뼈대가 맞습니다' : `순서 — ${task.chunks.join(' / ')}`}
              </div>
            )}
          </>
        )}

        {stage === 2 && (
          <div className="stack stack--tight">
            <p className="read" style={{ margin: 0, fontSize: 16 }}>{task.model}</p>
          </div>
        )}
      </div>

      {stage === 0 && (
        <button className="btn btn--primary btn--block" onClick={() => setStage(1)}>
          소리 내어 시도했어요 — 뼈대 맞추기
        </button>
      )}
      {stage === 1 && (
        <button className="btn btn--primary btn--block" disabled={!assembled} onClick={() => setStage(2)}>
          모범 문장 보기
        </button>
      )}
      {stage === 2 && (
        <TrafficLight
          onPick={(grade) =>
            onNext({ speak: { kind: 'produce', en: task.model, ko: task.ko ?? task.situation, grade } })
          }
        />
      )}
    </div>
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

/** 단어의 첫 글자만 남기고 가린다 — 섀도잉 2단계의 힌트. */
function firstLetters(en) {
  return en
    .split(' ')
    .map((w) => {
      const m = w.match(/[A-Za-z]/)
      if (!m) return w
      const i = w.indexOf(m[0])
      return w.slice(0, i + 1) + w.slice(i + 1).replace(/[A-Za-z]/g, '_')
    })
    .join(' ')
}

/**
 * 섀도잉 3단 은폐 — 같은 문장을 ①전문 보며 낭송 → ②첫 글자만 보고
 * → ③한국어만 보고 재현한다. 은폐가 깊어질수록 인출이 깊어진다.
 */
function Shadow({ anchor, onNext }) {
  const [stage, setStage] = useState(0)
  const STAGES = ['① 보면서 소리 내어', '② 첫 글자만 보고', '③ 한국어만 보고']
  return (
    <div className="stack">
      <div className="section-title">섀도잉 — {STAGES[Math.min(stage, 2)]}</div>
      <div className="panel stack stack--tight" style={{ textAlign: 'center' }}>
        {stage === 0 && <p className="read" style={{ margin: 0, fontSize: 19 }}>{anchor.en}</p>}
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
          </>
        )}
        {stage < 2 && <div className="ko">{anchor.ko}</div>}
      </div>
      {stage < 2 && (
        <button className="btn btn--primary btn--block" onClick={() => setStage(stage + 1)}>
          소리 내어 읽었어요 — 다음 단계
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
  const [cards] = useState(() => dueCards)
  const gradedToday = state.reviewLog.filter((r) => sameDay(r.at)).length
  const quota = settings?.dailyLimit ?? 20

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
            <div className="scene__speaker">🔥 최고 {session.bestCombo}연속 정답</div>
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
            말하기 {session.speak.length}개 — 🟢
            {session.speak.filter((x) => x.grade === 'green').length} · 🟡
            {session.speak.filter((x) => x.grade === 'yellow').length} · 🔴
            {session.speak.filter((x) => x.grade === 'red').length}
            {session.speak.some((x) => x.grade === 'red') && ' (🔴는 카드로 돌아옵니다)'}
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
