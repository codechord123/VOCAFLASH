import { useMemo, useState } from 'react'
import { Dot } from './Icon.jsx'

// 말하기 부품 — 수업(세션)과 문법 탭이 같은 것을 쓴다.
// 두 곳이 따로 놀면 한쪽만 좋아지고 다른 쪽은 '봤어요' 버튼으로 남는다.

/**
 * 신호등 자평 — 마이크 없이 발화를 책임화하는 최소 장치.
 * 모범과 대조한 뒤 스스로 세 단계로 판정한다. 🔴는 카드가 되어 돌아온다.
 */
export function TrafficLight({ onPick }) {
  return (
    <div className="stack stack--tight">
      <p className="hint" style={{ margin: 0 }}>모범과 비교해서 — 솔직하게. '못 했다'는 카드가 되어 돌아옵니다.</p>
      <div className="grade-row">
        <button className="btn grade-row__again" onClick={() => onPick('red')}>
          <Dot tone="red" /> 못 했다
        </button>
        <button className="btn" onClick={() => onPick('yellow')}>
          <Dot tone="yellow" /> 버벅였다
        </button>
        <button className="btn grade-row__good" onClick={() => onPick('green')}>
          <Dot tone="green" /> 막힘없이
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
export function ProduceLadder({ task, onGraded, label = '말하기' }) {
  const [stage, setStage] = useState(0)
  // 고른 것은 섞인 목록의 자리(index)로 기억한다. 글자로 기억하면 같은
  // 조각이 두 개인 과제에서 하나를 고를 때 둘 다 빠져 조립이 끝나지 않는다.
  const [pickedIdx, setPickedIdx] = useState([])
  const shuffled = useMemo(() => {
    const out = [...task.chunks]
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }, [task])
  const picked = pickedIdx.map((i) => shuffled[i])
  const remaining = shuffled.map((c, i) => ({ c, i })).filter(({ i }) => !pickedIdx.includes(i))
  const assembled = picked.length === task.chunks.length
  const assembledRight = assembled && picked.every((c, i) => c === task.chunks[i])

  return (
    <div className="stack">
      <div className="section-title">
        {label} — {['① 뜻만 보고 시도', '② 뼈대 조립', '③ 대조하고 한 번 더'][stage]}
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
                  <button key={pickedIdx[i]} className="quiz__piece is-picked"
                    onClick={() => setPickedIdx(pickedIdx.filter((_, j) => j !== i))}>{c}</button>
                ))
              )}
            </div>
            {remaining.length > 0 && (
              <div className="quiz__bank">
                {remaining.map(({ c, i }) => (
                  <button key={i} className="quiz__piece" onClick={() => setPickedIdx([...pickedIdx, i])}>{c}</button>
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
      {stage === 2 && <TrafficLight onPick={onGraded} />}
    </div>
  )
}
