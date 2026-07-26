import { useMemo, useState } from 'react'
import { buildQuiz, orderIsCorrect } from '../lib/quiz.js'
import { quizLabel } from '../lib/quizlog.js'

// 챕터를 다 읽고 나서 푸는 퀴즈.
//
// 읽기 화면 맨 아래, 회독 표시 다음에 둔다 — 다 읽은 뒤에 하는 것이라
// 위에 있으면 읽기도 전에 손이 간다.
//
// 전부 탭으로 푼다. 서서 보는 공부에 타이핑을 넣으면 그 자리에서 접는다.
// 처음에는 접어 두고, 누를 때 만든다 — 챕터를 열 때마다 문제를 미리
// 만들어 두면 읽기도 전에 계산부터 한다.

export default function ChapterQuiz({ analysis, levels, phrases, record = null, onFinish = null }) {
  const [open, setOpen] = useState(false)
  const [round, setRound] = useState(0) // 다시 풀 때마다 새로 뽑는다
  const [at, setAt] = useState(0)
  const [picked, setPicked] = useState([]) // 배열 문제에서 고른 조각
  const [checked, setChecked] = useState(null) // { correct }
  const [score, setScore] = useState({ right: 0, total: 0 })
  // 틀린 자리. 결과 화면에 남기고 기록에도 넣는다.
  const [wrong, setWrong] = useState([])
  const [saved, setSaved] = useState(false)

  const quiz = useMemo(
    () => (open ? buildQuiz(analysis, { levels, phrases }) : []),
    [open, round, analysis, levels, phrases]
  )

  if (!analysis) return null

  if (!open) {
    const last = quizLabel(record)
    return (
      <button
        className="btn btn--block"
        onClick={() => {
          setOpen(true)
          setAt(0)
          setPicked([])
          setChecked(null)
          setScore({ right: 0, total: 0 })
          setWrong([])
          setSaved(false)
        }}
      >
        이 챕터 퀴즈 풀기
        {/* 지난 결과를 버튼에 붙인다 — 다시 열 이유가 여기서 생긴다 */}
        {last && <span className="tab__count">{last}</span>}
      </button>
    )
  }

  if (quiz.length === 0) {
    return (
      <div className="panel">
        <p className="hint" style={{ margin: 0 }}>
          이 챕터는 아직 퀴즈로 낼 자료가 모자랍니다.
        </p>
      </div>
    )
  }

  const done = at >= quiz.length
  const q = quiz[at]

  function reset(nextRound = false) {
    setAt(0)
    setPicked([])
    setChecked(null)
    setScore({ right: 0, total: 0 })
    setWrong([])
    setSaved(false)
    if (nextRound) setRound((r) => r + 1)
  }

  function next() {
    setAt((i) => i + 1)
    setPicked([])
    setChecked(null)
  }

  function grade(correct) {
    setChecked({ correct })
    setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }))
    if (!correct) {
      setWrong((w) => [
        ...w,
        {
          kind: q.kind,
          en: q.kind === 'order' ? q.answer.join(' ') : `${q.before}${q.answer}${q.after}`,
          answer: q.kind === 'order' ? null : q.answer,
          ko: q.ko,
        },
      ])
    }
  }

  if (done) {
    // 기록은 결과 화면에 닿았을 때 한 번만 남긴다. 렌더마다 저장하면
    // 같은 회차가 여러 번 쌓인다.
    if (!saved) {
      setSaved(true)
      onFinish?.({ right: score.right, total: quiz.length, wrong })
    }
    return (
      <div className="panel stack">
        <div className="row row--between">
          <h4 style={{ margin: 0 }}>
            {quiz.length}문제 중 {score.right}개
          </h4>
          <span className="chip">{Math.round((score.right / quiz.length) * 100)}%</span>
        </div>

        {wrong.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            전부 맞혔습니다. 다음 챕터로 가세요.
          </p>
        ) : (
          <div className="stack stack--tight">
            <div className="section-title">틀린 자리</div>
            {wrong.map((w, i) => (
              <div key={i} className="panel" style={{ background: 'var(--surface-2)' }}>
                <div className="read" style={{ fontSize: 15 }}>
                  {w.en}
                </div>
                {w.answer && (
                  <div className="hint" style={{ textAlign: 'left', marginTop: 4 }}>
                    빈칸 — {w.answer}
                  </div>
                )}
                <div className="ko">{w.ko}</div>
              </div>
            ))}
          </div>
        )}

        <div className="row" style={{ gap: 'var(--s2)' }}>
          <button className="btn btn--sm" onClick={() => reset(true)}>
            다시 풀기
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
            닫기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="panel stack">
      <div className="row row--between">
        <span className="hint">
          {at + 1} / {quiz.length} · {q.kind === 'order' ? '순서 맞추기' : '빈칸 채우기'}
        </span>
        <button className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
          그만
        </button>
      </div>

      {q.kind === 'order' ? (
        <OrderQuestion
          q={q}
          picked={picked}
          setPicked={setPicked}
          checked={checked}
          onCheck={() => grade(orderIsCorrect(picked, q.answer))}
        />
      ) : (
        <BlankQuestion q={q} checked={checked} picked={picked} onPick={(c) => {
          setPicked([c])
          grade(c === q.answer)
        }} />
      )}

      {checked && (
        <div className="stack stack--tight">
          <div className={checked.correct ? 'quiz__verdict is-right' : 'quiz__verdict is-wrong'}>
            {checked.correct ? '맞았습니다' : '다시 보세요'}
          </div>
          {!checked.correct && (
            <div className="read" style={{ fontSize: 15 }}>
              {q.kind === 'order' ? q.answer.join(' ') : `${q.before}${q.answer}${q.after}`}
            </div>
          )}
          <div className="ko">{q.ko}</div>
          <button className="btn btn--primary btn--block" onClick={next}>
            {at + 1 === quiz.length ? '결과 보기' : '다음'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * 순서 맞추기.
 *
 * 위 칸이 답을 만드는 자리, 아래가 남은 조각이다. 올린 조각을 다시
 * 누르면 내려온다 — 되돌릴 수 없으면 한 번 잘못 누르고 포기한다.
 */
function OrderQuestion({ q, picked, setPicked, checked, onCheck }) {
  const remaining = [...q.shuffled]
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
              onClick={() => !checked && setPicked(picked.filter((_, j) => j !== i))}
              disabled={Boolean(checked)}
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
              onClick={() => !checked && setPicked([...picked, p])}
              disabled={Boolean(checked)}
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
          onClick={onCheck}
        >
          확인
        </button>
      )}
    </div>
  )
}

/** 빈칸 채우기. 네 개 중 하나를 누르면 바로 채점한다. */
function BlankQuestion({ q, checked, picked, onPick }) {
  return (
    <div className="stack stack--tight">
      <p className="read" style={{ margin: 0, fontSize: 17 }}>
        {q.before}
        <span className="quiz__blank">{checked ? picked[0] : '______'}</span>
        {q.after}
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
              onClick={() => !checked && onPick(c)}
              disabled={Boolean(checked)}
            >
              {c}
            </button>
          )
        })}
      </div>
    </div>
  )
}
