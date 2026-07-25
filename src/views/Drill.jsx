import { useMemo, useState } from 'react'
import { selectDrillSentences, shuffle } from '../lib/deck.js'

// 문장 연습. 한국어 → 영어 작문.
//
// AI를 쓰지 않는다. 시트에 한영 문장쌍 1,948개가 이미 있어서 생성할
// 이유가 없다. 노션 6챕터 프롬프트의 "Ch6 문장 20문제 뽑아줘"가
// 여기서 호출 0회로 해결된다.
//
// 채점은 자기 채점이다. 자동 채점을 넣으면 "a"와 "the" 차이로 오답
// 처리되어 학습을 방해한다. 영작에 정답이 하나가 아니다.

const SET_SIZE = 10

export default function Drill({ sentences, works }) {
  const [work, setWork] = useState('all')
  const [session, setSession] = useState(null)

  const pool = useMemo(
    () =>
      selectDrillSentences(sentences, {
        work: work === 'all' ? null : work,
        limit: Number.POSITIVE_INFINITY,
      }),
    [sentences, work]
  )

  function start() {
    setSession({ items: shuffle(pool).slice(0, SET_SIZE), index: 0, results: [] })
  }

  if (!session) {
    return (
      <div className="stack stack--loose">
        <div>
          <h1>문장 연습</h1>
          <p className="hint" style={{ marginTop: 'var(--s2)' }}>
            한국어를 보고 영어로 만들어 봅니다. 시트에 정리해둔 한영 문장쌍을
            그대로 씁니다.
          </p>
        </div>

        <div className="tiles">
          {works.map((w) => {
            const n = selectDrillSentences(sentences, {
              work: w.id,
              limit: Number.POSITIVE_INFINITY,
            }).length
            return (
              <div className="tile" key={w.id}>
                <div className="tile__value">{n.toLocaleString('ko')}</div>
                <div className="tile__label">{w.title}</div>
              </div>
            )
          })}
        </div>

        <div className="panel stack">
          <label className="field">
            <span className="label">작품</span>
            <select
              className="select"
              value={work}
              onChange={(e) => setWork(e.target.value)}
            >
              <option value="all">전체</option>
              {works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            사용 가능한 문장 {pool.length.toLocaleString('ko')}개. 자막이 중간에
            끊긴 조각과 잘린 행은 제외했습니다 — 정답이 성립하지 않아서요.
          </p>
          <button className="btn btn--primary btn--block" onClick={start} disabled={!pool.length}>
            {SET_SIZE}문제 시작
          </button>
        </div>
      </div>
    )
  }

  return <Session session={session} setSession={setSession} onExit={() => setSession(null)} />
}

function Session({ session, setSession, onExit }) {
  const { items, index, results } = session
  const item = items[index]
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)

  if (!item) {
    const correct = results.filter(Boolean).length
    return (
      <div className="stack stack--loose">
        <div className="empty">
          <div className="empty__icon">✓</div>
          <div className="empty__title">
            {results.length}문제 중 {correct}개 맞음
          </div>
          <p className="empty__body">
            자기 채점 결과입니다. 틀린 문장은 다음 세트에 다시 나올 수 있습니다.
          </p>
          <div className="row">
            <button className="btn" onClick={onExit}>
              나가기
            </button>
            <button
              className="btn btn--primary"
              onClick={() => setSession({ ...session, items: shuffle(items), index: 0, results: [] })}
            >
              다시 하기
            </button>
          </div>
        </div>
      </div>
    )
  }

  function record(ok) {
    setSession({ ...session, index: index + 1, results: [...results, ok] })
    setAnswer('')
    setRevealed(false)
  }

  const progress = (index / items.length) * 100

  return (
    <div className="stack stack--loose">
      <div className="row row--between">
        <button className="btn btn--ghost btn--sm" onClick={onExit}>
          ← 나가기
        </button>
        <span className="chip">
          {index + 1} / {items.length}
        </span>
      </div>

      <div className="progress">
        <div className="progress__bar" style={{ width: `${progress}%` }} />
      </div>

      <div className="panel stack">
        <div className="section-title">한국어</div>
        <div className="read read--lg">{item.koFluent || item.ko}</div>
        {item.speaker && <span className="chip">{item.speaker}</span>}
      </div>

      <div className="field">
        <label className="label" htmlFor="drill-answer">
          영어로 옮겨 보세요
        </label>
        <textarea
          id="drill-answer"
          className="textarea"
          style={{ minHeight: 96 }}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="영어 문장을 입력하세요"
          disabled={revealed}
        />
      </div>

      {!revealed ? (
        <button className="btn btn--primary btn--block" onClick={() => setRevealed(true)}>
          정답 확인
        </button>
      ) : (
        <div className="stack">
          <div className="panel stack stack--tight">
            <div className="section-title">원문</div>
            <div className="read read--lg">{item.en}</div>
            {answer.trim() && (
              <>
                <div className="section-title">내 답</div>
                <div className="read" style={{ color: 'var(--text-dim)' }}>{answer}</div>
              </>
            )}
          </div>
          <div className="grade-row">
            <button className="btn grade grade--again" onClick={() => record(false)}>
              <span>틀림</span>
            </button>
            <button className="btn grade grade--hard" onClick={() => record(false)}>
              <span>비슷함</span>
            </button>
            <button className="btn grade grade--good" onClick={() => record(true)}>
              <span>맞음</span>
            </button>
          </div>
          <p className="hint">
            영작은 정답이 하나가 아닙니다. 뜻이 통하면 맞은 것으로 하세요 —
            관사·시제만 다른 것을 오답으로 세면 연습이 방해받습니다.
          </p>
        </div>
      )}
    </div>
  )
}
