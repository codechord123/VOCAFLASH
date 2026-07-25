import { useMemo, useState } from 'react'

// 유닛 퀴즈. 6유형 20문항, 전부 로컬 자동 채점.
//
// 원칙 둘. (1) 타이핑 없음 — 지하철에서 한 손으로 서서 푼다. 산출형도
// 청크를 탭해서 조립한다. (2) 오답은 규칙으로 역참조 — 틀린 문항 밑에
// 해당 규칙이 바로 펼쳐진다. 오답노트를 따로 만들지 않는다.

/** 문항 id 기반 결정적 셔플. 리렌더마다 순서가 바뀌면 풀 수 없다. */
function seededShuffle(arr, seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), h | 1)
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296
  }
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const TYPE_LABELS = {
  meaning: '뜻 맞추기',
  blank: '빈칸 채우기',
  truefalse: 'O/X 함정',
  arrange: '문장 배열',
  koToEn: '한→영 조립',
  anchorRestore: '앵커 복원',
}

export default function UnitQuiz({ unit, quizzes, cardCount, alreadyDone, onExit, onDone }) {
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState([]) // { quizId, correct, ruleId, type }

  const rules = useMemo(
    () => new Map(unit.rules.map((r) => [r.id, r])),
    [unit]
  )

  const q = quizzes[index]
  const finished = index >= quizzes.length

  function record(correct) {
    setResults((r) => [
      ...r,
      { quizId: q.quizId, correct, ruleId: q.relatedRuleId, type: q.type },
    ])
  }

  if (finished) {
    const score = results.filter((r) => r.correct).length
    const wrong = results.filter((r) => !r.correct)
    return (
      <div className="stack stack--loose">
        <header className="stack stack--tight">
          <h1>퀴즈 결과</h1>
        </header>

        <div className="tiles">
          <div className="tile tile--accent">
            <div className="tile__value">
              {score}/{quizzes.length}
            </div>
            <div className="tile__label">정답</div>
          </div>
          <div className="tile">
            <div className="tile__value">{wrong.length}</div>
            <div className="tile__label">틀림</div>
          </div>
        </div>

        {wrong.length > 0 && (
          <section className="stack">
            <div className="section-title">다시 볼 규칙</div>
            {[...new Set(wrong.map((w) => w.ruleId).filter(Boolean))].map((id) => {
              const r = rules.get(id)
              return (
                <article className="panel stack stack--tight" key={id}>
                  <h4 style={{ margin: 0 }}>{r.title}</h4>
                  <p style={{ color: 'var(--text-dim)', margin: 0 }}>{r.body}</p>
                </article>
              )
            })}
          </section>
        )}

        <div className="panel stack stack--tight">
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>
            {alreadyDone
              ? '유닛 카드는 이미 복습 덱에 있습니다. 점수만 갱신됩니다.'
              : `이 유닛의 카드 ${cardCount}장이 복습 덱에 들어갑니다 — 단어 탭에서 스와이프로 복습하세요.`}
          </p>
        </div>

        <button className="btn btn--primary btn--block" onClick={() => onDone(score)}>
          학습 완료
        </button>
      </div>
    )
  }

  return (
    <div className="stack stack--loose">
      <div className="row row--between">
        <button className="btn btn--ghost btn--sm" onClick={onExit}>
          ← 그만하기
        </button>
        <span className="chip">
          {index + 1} / {quizzes.length} · {TYPE_LABELS[q.type]}
        </span>
      </div>

      <div className="progress">
        <div
          className="progress__bar"
          style={{ width: `${(index / quizzes.length) * 100}%` }}
        />
      </div>

      <Question
        key={q.quizId}
        q={q}
        rule={q.relatedRuleId ? rules.get(q.relatedRuleId) : null}
        onAnswered={record}
        onNext={() => setIndex((i) => i + 1)}
      />
    </div>
  )
}

function Question({ q, rule, onAnswered, onNext }) {
  if (q.type === 'meaning' || q.type === 'blank') {
    return <ChoiceQ q={q} rule={rule} onAnswered={onAnswered} onNext={onNext} />
  }
  if (q.type === 'truefalse') {
    return <TrueFalseQ q={q} rule={rule} onAnswered={onAnswered} onNext={onNext} />
  }
  if (q.type === 'arrange' || q.type === 'koToEn') {
    return <ArrangeQ q={q} rule={rule} onAnswered={onAnswered} onNext={onNext} />
  }
  return <RestoreQ q={q} rule={rule} onAnswered={onAnswered} onNext={onNext} />
}

/** 채점 후 공통 피드백: 정오 + 해설 + 관련 규칙 + 다음 버튼 */
function Feedback({ correct, detail, rule, onNext }) {
  return (
    <div className="stack">
      <div
        className="panel stack stack--tight"
        style={{
          borderColor: correct ? 'var(--good)' : 'var(--again)',
          background: correct ? 'var(--good-soft)' : 'var(--again-soft)',
        }}
      >
        <strong>{correct ? '정답' : '오답'}</strong>
        {detail && <p style={{ margin: 0, color: 'var(--text-dim)' }}>{detail}</p>}
      </div>

      {!correct && rule && (
        <article className="panel stack stack--tight">
          <div className="hint" style={{ textAlign: 'left' }}>
            관련 규칙
          </div>
          <h4 style={{ margin: 0 }}>{rule.title}</h4>
          <p style={{ color: 'var(--text-dim)', margin: 0 }}>{rule.body}</p>
        </article>
      )}

      <button className="btn btn--primary btn--block" onClick={onNext}>
        다음
      </button>
    </div>
  )
}

// ── ① 뜻 맞추기 · ② 빈칸 (4지선다) ─────────────────────────────────

function ChoiceQ({ q, rule, onAnswered, onNext }) {
  const [picked, setPicked] = useState(null)
  const order = useMemo(
    () => seededShuffle(q.options.map((_, i) => i), q.quizId),
    [q]
  )
  const answered = picked != null
  const correct = picked === q.answerIndex

  function choose(i) {
    if (answered) return
    setPicked(i)
    onAnswered(i === q.answerIndex)
  }

  return (
    <div className="stack">
      <p className="read" style={{ fontSize: 17, lineHeight: 1.7 }}>
        {q.prompt}
      </p>
      <div className="stack stack--tight">
        {order.map((i) => {
          let border
          if (answered && i === q.answerIndex) border = 'var(--good)'
          else if (answered && i === picked) border = 'var(--again)'
          return (
            <button
              key={i}
              className="panel"
              onClick={() => choose(i)}
              disabled={answered}
              style={{
                padding: 'var(--s3) var(--s4)',
                textAlign: 'left',
                cursor: answered ? 'default' : 'pointer',
                font: 'inherit',
                color: 'inherit',
                borderColor: border,
              }}
            >
              {q.options[i]}
            </button>
          )
        })}
      </div>
      {answered && (
        <Feedback
          correct={correct}
          detail={correct ? null : `정답: ${q.options[q.answerIndex]}`}
          rule={rule}
          onNext={onNext}
        />
      )}
    </div>
  )
}

// ── ③ O/X 함정 ──────────────────────────────────────────────────────

function TrueFalseQ({ q, rule, onAnswered, onNext }) {
  const [picked, setPicked] = useState(null)
  const answered = picked != null
  const correct = picked === q.isCorrect

  function choose(v) {
    if (answered) return
    setPicked(v)
    onAnswered(v === q.isCorrect)
  }

  return (
    <div className="stack">
      <p className="read" style={{ fontSize: 17, lineHeight: 1.7 }}>
        {q.prompt}
      </p>
      <div className="grade-row">
        <button
          className="btn grade grade--good"
          onClick={() => choose(true)}
          disabled={answered}
          style={answered && q.isCorrect ? { borderColor: 'var(--good)' } : undefined}
        >
          ⭕ 맞다
        </button>
        <button
          className="btn grade grade--again"
          onClick={() => choose(false)}
          disabled={answered}
          style={answered && !q.isCorrect ? { borderColor: 'var(--good)' } : undefined}
        >
          ✗ 틀리다
        </button>
      </div>
      {answered && (
        <Feedback correct={correct} detail={q.explanation} rule={rule} onNext={onNext} />
      )}
    </div>
  )
}

// ── ④ 배열 · ⑤ 한→영 (청크 탭 조립) ────────────────────────────────

function ArrangeQ({ q, rule, onAnswered, onNext }) {
  const bank = useMemo(
    () => seededShuffle(q.chunks.map((_, i) => i), q.quizId),
    [q]
  )
  const [picked, setPicked] = useState([]) // 원본 chunks 인덱스 순서
  const [graded, setGraded] = useState(null)

  const remaining = bank.filter((i) => !picked.includes(i))

  function grade() {
    const key = picked.join(',')
    const ok =
      key === q.answer.join(',') ||
      (q.altAnswers ?? []).some((a) => a.join(',') === key)
    setGraded(ok)
    onAnswered(ok)
  }

  const correctSentence = q.answer.map((i) => q.chunks[i]).join(' ')

  return (
    <div className="stack">
      <p className="read" style={{ fontSize: 17, lineHeight: 1.7 }}>
        {q.prompt}
      </p>

      {/* 조립 줄 — 탭하면 되돌아간다 */}
      <div
        className="panel row"
        style={{ flexWrap: 'wrap', gap: 'var(--s2)', minHeight: 52 }}
        aria-label="조립한 문장"
      >
        {picked.length === 0 && (
          <span className="hint">아래 조각을 순서대로 탭하세요</span>
        )}
        {picked.map((i) => (
          <button
            key={i}
            className="chip chip--box"
            style={{ cursor: 'pointer', fontSize: 14 }}
            disabled={graded != null}
            onClick={() => setPicked((p) => p.filter((x) => x !== i))}
          >
            {q.chunks[i]}
          </button>
        ))}
      </div>

      {/* 조각 은행 */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--s2)' }}>
        {remaining.map((i) => (
          <button
            key={i}
            className="chip"
            style={{ cursor: 'pointer', fontSize: 14 }}
            disabled={graded != null}
            onClick={() => setPicked((p) => [...p, i])}
          >
            {q.chunks[i]}
          </button>
        ))}
      </div>

      {graded == null ? (
        <button
          className="btn btn--primary btn--block"
          disabled={picked.length !== q.chunks.length}
          onClick={grade}
        >
          확인
        </button>
      ) : (
        <Feedback
          correct={graded}
          detail={graded ? null : `정답: ${correctSentence}`}
          rule={rule}
          onNext={onNext}
        />
      )}
    </div>
  )
}

// ── ⑥ 앵커 복원 (빈칸을 조각으로 채움) ──────────────────────────────

function RestoreQ({ q, rule, onAnswered, onNext }) {
  const bank = useMemo(
    () => seededShuffle(q.blanks.map((_, i) => i), q.quizId),
    [q]
  )
  // slots[n] = 빈칸 n에 넣은 blanks 인덱스 (null = 비어 있음)
  const [slots, setSlots] = useState(() => q.blanks.map(() => null))
  const [graded, setGraded] = useState(null)

  const used = new Set(slots.filter((v) => v != null))
  const segments = q.text.split(/__(\d)__/g)

  function fill(bankIdx) {
    const empty = slots.findIndex((v) => v == null)
    if (empty === -1) return
    setSlots((s) => s.map((v, i) => (i === empty ? bankIdx : v)))
  }

  function grade() {
    const ok = slots.every((v, i) => v != null && q.blanks[v] === q.blanks[i])
    setGraded(ok)
    onAnswered(ok)
  }

  return (
    <div className="stack">
      <p className="hint" style={{ textAlign: 'left' }}>
        {q.prompt}
      </p>

      <div className="panel">
        <p className="read" style={{ fontSize: 16, lineHeight: 1.9, margin: 0 }}>
          {segments.map((seg, i) => {
            if (i % 2 === 0) return <span key={i}>{seg}</span>
            const slotIdx = Number(seg) - 1
            const v = slots[slotIdx]
            return (
              <button
                key={i}
                className="chip"
                disabled={graded != null}
                onClick={() =>
                  setSlots((s) => s.map((x, j) => (j === slotIdx ? null : x)))
                }
                style={{
                  cursor: 'pointer',
                  margin: '0 2px',
                  minWidth: 56,
                  borderStyle: v == null ? 'dashed' : 'solid',
                  color: v == null ? 'var(--text-faint)' : 'var(--accent)',
                }}
              >
                {v == null ? `빈칸 ${slotIdx + 1}` : q.blanks[v]}
              </button>
            )
          })}
        </p>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--s2)' }}>
        {bank
          .filter((i) => !used.has(i))
          .map((i) => (
            <button
              key={i}
              className="chip"
              style={{ cursor: 'pointer', fontSize: 14 }}
              disabled={graded != null}
              onClick={() => fill(i)}
            >
              {q.blanks[i]}
            </button>
          ))}
      </div>

      {graded == null ? (
        <button
          className="btn btn--primary btn--block"
          disabled={slots.some((v) => v == null)}
          onClick={grade}
        >
          확인
        </button>
      ) : (
        <Feedback
          correct={graded}
          detail={graded ? null : `정답: ${q.blanks.join(' · ')}`}
          rule={rule}
          onNext={onNext}
        />
      )}
    </div>
  )
}
