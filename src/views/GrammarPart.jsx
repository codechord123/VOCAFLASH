import { useEffect, useMemo, useState } from 'react'
import { Dot } from './Icon.jsx'
import course from '../data/grammar-course.json'
import { markRead, readOf, undoRead } from '../lib/reads.js'
import { ReadMeter, ReadTracker } from './ReadMeter.jsx'
import { ProduceLadder } from './Speak.jsx'
import { unitCourseStatus } from '../lib/plan.js'
import { addMistakeCards, cardsFromGrammarWrong, cardsFromSpeakWrong } from '../lib/mistakes.js'

// 회화를 위한 기본 문법. 유닛 하나가 PPP 세 화면으로 되어 있다.
//
//   Present  규칙 한 줄 + 그것이 실제로 쓰인 대사
//   Practice 탭으로 푸는 통제 연습, 틀리면 왜 그런지 그 자리에서
//   Produce  발판 조각을 보고 자기 문장을 만들어 말한 뒤 모범과 대조
//
// 설명만 읽으면 다음 날 아무것도 안 남고, 문제만 풀면 왜 그런지 모른 채
// 답을 외운다. 세 번째 화면이 있어야 아는 것이 말이 된다.
//
// 타이핑은 없다. Produce도 입으로 말하고 눈으로 대조한다 — 서서 하는
// 공부에 자판이 끼면 그 자리에서 접는다.

const WORK = 'grammar' // 회독 저장 키의 작품 자리

export default function GrammarPart({ reads, grammar, plan, commit, initialUnitId = null }) {
  // 오늘 화면에서 넘어오면 그날의 유닛이 바로 열린다
  const [openId, setOpenId] = useState(initialUnitId)
  const units = course.units

  const unit = units.find((u) => u.id === openId) ?? null
  const progressOf = (id) => grammar?.unitProgress?.[id] ?? null

  if (unit) {
    return (
      <UnitPPP
        key={unit.id}
        unit={unit}
        read={readOf(reads, WORK, unit.id)}
        progress={progressOf(unit.id)}
        onMarkRead={() => commit((s) => markRead(s, WORK, unit.id))}
        onUndoRead={() => commit((s) => undoRead(s, WORK, unit.id))}
        onFinish={(score, wrong = []) =>
          // 점수와 함께 틀린 문항을 오답 은행으로 보낸다. 결과 화면에서
          // 사라지는 오답은 배움이 아니라 채점일 뿐이다.
          commit((s) =>
            addMistakeCards(
              {
                ...s,
                grammar: {
                  ...(s.grammar ?? {}),
                  unitProgress: {
                    ...(s.grammar?.unitProgress ?? {}),
                    [unit.id]: { score, total: unit.practice.length, at: Date.now() },
                  },
                },
              },
              cardsFromGrammarWrong(unit, wrong)
            )
          )
        }
        onSpeak={(task, grade) =>
          // 문법 탭의 말하기도 수업과 같은 기록에 실린다 — 성장 화면의
          // 🟢 비율과 오답 노트가 어디서 말했든 같은 장부를 본다
          commit((s) => {
            const entry = {
              kind: 'produce',
              en: task.model,
              ko: task.ko ?? task.situation,
              grade,
              day: s.plan?.day ?? 1,
              at: Date.now(),
              via: 'grammar-tab',
            }
            const next = { ...s, speakLog: [...(s.speakLog ?? []), entry].slice(-300) }
            return grade === 'red'
              ? addMistakeCards(next, cardsFromSpeakWrong([{ ...entry, label: `문법 ${unit.order} · 말하기` }]))
              : next
          })
        }
        onBack={() => {
          setOpenId(null)
          window.scrollTo({ top: 0 })
        }}
      />
    )
  }


  return (
    <div className="stack stack--loose">
      <header className="stack stack--tight">
        <h1>문법 — 말하기 위한 기본기</h1>
        <p className="hint">
          유닛 하나가 설명 · 연습 · 말하기 세 화면입니다. 규칙을 읽고, 탭으로 풀고,
          마지막에 자기 문장을 만들어 말해 봅니다. 예문은 읽고 있는 작품의 대사에서
          가져왔습니다.
        </p>
      </header>

      <div className="tiles">
        <div className="tile tile--accent">
          <div className="tile__value">
            {units.filter((u) => unitCourseStatus(plan, u.id)?.tone !== 'ahead').length}/{units.length}
          </div>
          <div className="tile__label">수업에서 만난 유닛</div>
        </div>
        <div className="tile">
          <div className="tile__value">
            {units.reduce((n, u) => n + u.practice.length, 0)}
          </div>
          <div className="tile__label">연습 문항</div>
        </div>
        <div className="tile">
          <div className="tile__value">
            {units.reduce((n, u) => n + u.produce.length, 0)}
          </div>
          <div className="tile__label">말하기 과제</div>
        </div>
      </div>

      {units.map((u) => {
        const p = progressOf(u.id)
        const course = unitCourseStatus(plan, u.id)
        return (
          <button
            className="panel"
            key={u.id}
            onClick={() => {
              setOpenId(u.id)
              window.scrollTo({ top: 0 })
            }}
            style={{
              padding: 'var(--s3) var(--s4)',
              textAlign: 'left',
              cursor: 'pointer',
              font: 'inherit',
              color: 'inherit',
              borderColor: p ? 'var(--accent-border)' : undefined,
            }}
          >
            <div className="row row--between">
              <span className="list__main">
                <span className="list__title">
                  {u.order} · {u.title}
                </span>
                <span className="list__meta">{u.goal}</span>
                <ReadMeter read={readOf(reads, WORK, u.id)} />
              </span>
              <span className="stack stack--tight" style={{ alignItems: 'flex-end' }}>
                {course && <span className={`chip course-chip is-${course.tone}`}>{course.label}</span>}
                {p && <span className="chip">연습 {p.score}/{p.total}</span>}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

const STAGES = [
  { id: 'discover', label: '맞혀 보기' },
  { id: 'present', label: '설명' },
  { id: 'practice', label: '연습' },
  { id: 'produce', label: '말하기' },
]

function UnitPPP({ unit, read, progress, onMarkRead, onUndoRead, onFinish, onSpeak, onBack }) {
  // 발견 문답이 있는 유닛은 규칙을 읽기 전에 먼저 맞혀 본다
  const hasDiscover = (unit.discover?.length ?? 0) > 0
  const stages = hasDiscover ? STAGES : STAGES.filter((s) => s.id !== 'discover')
  const [stage, setStage] = useState(hasDiscover ? 'discover' : 'present')

  return (
    <div className="stack stack--loose">
      <div className="row row--between">
        <button className="btn btn--ghost btn--sm" onClick={onBack}>
          ← 유닛 목록
        </button>
        {progress && (
          <span className="chip chip--accent">
            지난 결과 {progress.score}/{progress.total}
          </span>
        )}
      </div>

      <div>
        <h2>
          {unit.order} · {unit.title}
        </h2>
        <p className="hint" style={{ marginTop: 'var(--s2)' }}>
          {unit.goal}
        </p>
      </div>

      {/* 세 단계를 탭으로 오갈 수 있게 둔다. 순서대로 하는 것이 기본이지만,
          이미 아는 규칙이면 연습부터 눌러도 막지 않는다. */}
      <nav className="subtabs" role="tablist" aria-label="학습 단계">
        {stages.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={stage === s.id}
            className="tab"
            onClick={() => {
              setStage(s.id)
              window.scrollTo({ top: 0 })
            }}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {stage === 'discover' && (
        <Discover
          unit={unit}
          onNext={() => {
            setStage('present')
            window.scrollTo({ top: 0 })
          }}
        />
      )}
      {stage === 'present' && <Present unit={unit} onNext={() => setStage('practice')} />}
      {stage === 'practice' && (
        <Practice unit={unit} onDone={onFinish} onNext={() => setStage('produce')} />
      )}
      {stage === 'produce' && <Produce unit={unit} onSpeak={onSpeak} />}

      <ReadTracker read={read} onMark={onMarkRead} onUndo={onUndoRead} verb="공부함" />
    </div>
  )
}

/**
 * 0단계 — 먼저 맞혀 보기. 규칙을 읽기 전에 감으로 고른다.
 * 예측이 앞서야 설명이 박힌다. 맞든 틀리든 이유는 바로 보여 준다.
 */
function Discover({ unit, onNext }) {
  const [at, setAt] = useState(0)
  const [picked, setPicked] = useState(null)
  const [right, setRight] = useState(0)
  const items = unit.discover
  const d = items[at]

  if (!d) {
    return (
      <div className="panel stack">
        <h4 style={{ margin: 0 }}>
          감으로 {items.length}개 중 {right}개
        </h4>
        <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
          {right === items.length
            ? '감이 이미 맞습니다. 설명에서 그 감에 이름을 붙여 봅니다.'
            : '헷갈린 자리가 바로 이 유닛이 다루는 자리입니다. 설명에서 갈라 봅니다.'}
        </p>
        <button className="btn btn--primary btn--block" onClick={onNext}>
          설명으로
        </button>
      </div>
    )
  }

  const answer = d.options[d.answerIndex]
  return (
    <div className="panel stack">
      <span className="hint">
        먼저 맞혀 보기 {at + 1} / {items.length}
      </span>
      <div className="section-title">{d.q}</div>
      <p style={{ margin: 0 }}>{d.prompt}</p>
      <div className="quiz__bank">
        {d.options.map((o) => {
          const cls = picked === null ? '' : o === answer ? ' is-right' : o === picked ? ' is-wrong' : ''
          return (
            <button
              key={o}
              className={`quiz__piece${cls}`}
              disabled={picked !== null}
              onClick={() => {
                setPicked(o)
                if (o === answer) setRight((n) => n + 1)
              }}
            >
              {o}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <div className="stack stack--tight">
          <div className={picked === answer ? 'quiz__verdict is-right' : 'quiz__verdict is-wrong'}>
            {picked === answer ? '감이 맞았습니다' : `이쪽 — ${answer}`}
          </div>
          <p className="hint" style={{ textAlign: 'left', margin: 0 }}>{d.why}</p>
          <button
            className="btn btn--primary btn--block"
            onClick={() => {
              setAt(at + 1)
              setPicked(null)
            }}
          >
            {at + 1 === items.length ? '결과 보기' : '다음'}
          </button>
        </div>
      )}
    </div>
  )
}

/** 1단계 — 규칙과 그것이 실제로 쓰인 자리. */
function Present({ unit, onNext }) {
  return (
    <div className="stack stack--loose">
      <div className="panel stack stack--tight">
        <div className="section-title">왜 헷갈리는가</div>
        <p style={{ margin: 0 }}>{unit.why}</p>
      </div>

      <div
        className="panel stack stack--tight"
        style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-soft)' }}
      >
        <div className="section-title">규칙</div>
        <p style={{ margin: 0, fontWeight: 560 }}>{unit.present.rule}</p>
      </div>

      <section className="stack stack--tight">
        <div className="section-title">갈라 보기</div>
        {unit.present.points.map((p, i) => (
          <div className="panel" key={i} style={{ padding: 'var(--s3) var(--s4)' }}>
            {p}
          </div>
        ))}
      </section>

      <section className="stack stack--tight">
        <div className="section-title">실제로 쓰인 자리</div>
        {unit.present.examples.map((e, i) => (
          <div className="panel stack stack--tight" key={i}>
            <p className="read" style={{ margin: 0, fontSize: 17 }}>
              {e.en}
            </p>
            <div className="ko">{e.ko}</div>
            <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
              {e.note}
            </p>
            {e.from && <span className="chip">{e.from}</span>}
          </div>
        ))}
      </section>

      <button className="btn btn--primary btn--block" onClick={onNext}>
        연습으로 — {unit.practice.length}문항
      </button>
    </div>
  )
}

/** 2단계 — 탭으로 푸는 통제 연습. 틀리면 그 자리에서 이유를 준다. */
function Practice({ unit, onDone, onNext }) {
  const [round, setRound] = useState(0) // 다시 풀 때마다 순서를 새로 섞는다
  const [at, setAt] = useState(0)
  const [picked, setPicked] = useState([])
  const [checked, setChecked] = useState(null)
  const [score, setScore] = useState(0)
  const [wrongIdx, setWrongIdx] = useState([])
  const [saved, setSaved] = useState(false)
  // 다시 풀 때 틀린 것만 모아 풀 수 있게 한다
  const [subset, setSubset] = useState(null)

  // 순서를 섞는다. 늘 같은 순서로 나오면 두 번째부터는 규칙이 아니라
  // 자리를 외우게 된다.
  const items = useMemo(() => {
    const base = subset ? subset.map((i) => unit.practice[i]) : [...unit.practice]
    for (let i = base.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[base[i], base[j]] = [base[j], base[i]]
    }
    return base
  }, [unit, round, subset])

  const q = items[at]
  const done = at >= items.length

  // 결과 화면에 닿으면 한 번 기록한다. 그리는 도중에 저장하면 React가
  // 다른 컴포넌트를 갱신한다고 경고하고, 개발 모드에서는 두 번 쌓인다.
  useEffect(() => {
    if (!done || saved) return
    setSaved(true)
    // 기록은 전체 풀이만 남긴다. 틀린 것만 다시 푼 점수를 적으면
    // 2문항 만점이 6문항 만점처럼 보인다.
    if (!subset) onDone?.(score, wrongIdx.map((i) => unit.practice[i]).filter(Boolean))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, saved])

  function restart(onlyWrong = false) {
    setSubset(onlyWrong ? [...wrongIdx] : null)
    setRound((r) => r + 1)
    setAt(0)
    setPicked([])
    setChecked(null)
    setScore(0)
    setWrongIdx([])
    setSaved(false)
  }

  if (done) {
    return (
      <div className="panel stack">
        <div className="row row--between">
          <h4 style={{ margin: 0 }}>
            {items.length}문항 중 {score}개
          </h4>
          <span className="chip">{Math.round((score / items.length) * 100)}%</span>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          {score === items.length
            ? '규칙이 손에 붙었습니다. 이제 직접 만들어 말해 보세요.'
            : '틀린 자리는 설명 화면에 그대로 있습니다.'}
        </p>
        <div className="row" style={{ gap: 'var(--s2)' }}>
          {/* 틀린 것을 그 자리에서 다시 잡는 것이 제일 싸게 먹히는 복습이다 */}
          {wrongIdx.length > 0 && !subset && (
            <button className="btn btn--sm" onClick={() => restart(true)}>
              틀린 {wrongIdx.length}개만 다시
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={() => restart(false)}>
            처음부터 다시
          </button>
        </div>
        <button className="btn btn--primary btn--block" onClick={onNext}>
          말하기로 — {unit.produce.length}과제
        </button>
      </div>
    )
  }

  function grade(correct) {
    setChecked({ correct })
    if (correct) setScore((s) => s + 1)
    // 틀린 문항의 원본 위치를 기억해 둔다 — '틀린 것만 다시'가 이걸 쓴다
    else setWrongIdx((w) => [...w, unit.practice.indexOf(q)])
  }

  return (
    <div className="panel stack">
      <span className="hint">
        {at + 1} / {items.length} · {q.q}
      </span>

      {q.kind === 'choice' ? (
        <>
          <p className="read" style={{ margin: 0, fontSize: 17 }}>
            {q.sentence.includes('___') ? (
              <>
                {q.sentence.split('___')[0]}
                <span className="quiz__blank">{checked ? picked[0] : '______'}</span>
                {q.sentence.split('___')[1]}
              </>
            ) : (
              // 빈칸 없는 문항 — 오류 찾기, 뜻 대조. 문장을 그대로 보여 준다.
              q.sentence
            )}
          </p>
          <div className="quiz__bank">
            {q.choices.map((c) => {
              const state = !checked
                ? ''
                : c === q.answer
                  ? ' is-right'
                  : c === picked[0]
                    ? ' is-wrong'
                    : ''
              return (
                <button
                  key={c}
                  className={`quiz__piece${state}`}
                  disabled={Boolean(checked)}
                  onClick={() => {
                    setPicked([c])
                    grade(c === q.answer)
                  }}
                >
                  {c === '-' ? '(아무것도 안 붙임)' : c}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <OrderItem q={q} picked={picked} setPicked={setPicked} checked={checked} onCheck={grade} />
      )}

      {checked && (
        <div className="stack stack--tight">
          <div className={checked.correct ? 'quiz__verdict is-right' : 'quiz__verdict is-wrong'}>
            {checked.correct ? '맞았습니다' : '다시 보세요'}
          </div>
          {/* 왜 그 답인지가 이 화면의 본체다. 맞아도 보여준다 —
              찍어서 맞힌 것과 알아서 맞힌 것을 스스로 가를 수 있어야 한다. */}
          <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
            {q.why}
          </p>
          <button
            className="btn btn--primary btn--block"
            onClick={() => {
              setAt((i) => i + 1)
              setPicked([])
              setChecked(null)
            }}
          >
            {at + 1 === items.length ? '결과 보기' : '다음'}
          </button>
        </div>
      )}
    </div>
  )
}

function OrderItem({ q, picked, setPicked, checked, onCheck }) {
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

  return (
    <div className="stack stack--tight">
      <div className="ko" style={{ color: 'var(--text)' }}>
        {q.ko}
      </div>
      <div className="quiz__slot">
        {picked.length === 0 ? (
          <span className="hint">아래에서 순서대로 누르세요</span>
        ) : (
          picked.map((p, i) => (
            <button
              key={`${p}-${i}`}
              className="quiz__piece is-picked"
              disabled={Boolean(checked)}
              onClick={() => setPicked(picked.filter((_, j) => j !== i))}
            >
              {p}
            </button>
          ))
        )}
      </div>
      {remaining.length > 0 && (
        <div className="quiz__bank">
          {remaining.map((p, i) => (
            <button
              key={`${p}-${i}`}
              className="quiz__piece"
              disabled={Boolean(checked)}
              onClick={() => setPicked([...picked, p])}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      {!checked && (
        <button
          className="btn btn--primary btn--block"
          disabled={picked.length !== q.answer.length}
          onClick={() => onCheck(picked.every((p, i) => p === q.answer[i]))}
        >
          확인
        </button>
      )}
    </div>
  )
}

/**
 * 3단계 — 자기 문장 만들기. 수업과 같은 3단 사다리로 한 과제씩:
 * 뜻만 보고 입으로 → 뼈대 조립 → 대조하고 한 번 더 + 신호등 자평.
 * 예전에는 조각을 다 보여 주고 '말해 봤어요'로 넘겨서, 사실상 예문
 * 목록이었다.
 */
function Produce({ unit, onSpeak }) {
  const [at, setAt] = useState(0)
  const [grades, setGrades] = useState([])
  const task = unit.produce[at]

  if (!task) {
    const n = (g) => grades.filter((x) => x === g).length
    return (
      <div className="panel stack">
        <h4 style={{ margin: 0 }}>말하기 {grades.length}개</h4>
        <p style={{ margin: 0 }}>
          <Dot tone="green" /> {n('green')} · <Dot tone="yellow" /> {n('yellow')} · <Dot tone="red" /> {n('red')}
        </p>
        <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
          {n('red') > 0
            ? "'못 했다'는 오답 노트에 들어가 카드로 돌아옵니다."
            : '자평은 성장 기록의 말하기 추이에 쌓입니다.'}
        </p>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setAt(0)
            setGrades([])
          }}
        >
          처음부터 다시 말하기
        </button>
      </div>
    )
  }

  return (
    <div className="stack">
      <span className="hint">
        과제 {at + 1} / {unit.produce.length}
      </span>
      <ProduceLadder
        key={at}
        task={task}
        label={`과제 ${at + 1}`}
        onGraded={(grade) => {
          onSpeak?.(task, grade)
          setGrades([...grades, grade])
          setAt(at + 1)
          window.scrollTo({ top: 0 })
        }}
      />
    </div>
  )
}
