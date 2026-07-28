import { useEffect, useRef } from 'react'
import { READ_GOAL, lastReadLabel, secsLabel } from '../lib/reads.js'

// 회독 표시. 목록의 한 줄짜리와, 다 보고 나서 누르는 칸.
//
// 리더 두 곳과 구문독해가 같은 것을 쓴다. 세 번째 사본을 만들려다
// 여기로 모았다 — 목표 회수나 문구를 고칠 때 한 군데만 고치면 된다.
//
// 자동으로 세지 않는다는 원칙은 그대로다. 열기만 해도 올라가면 숫자가
// 거짓이 되고, 거짓인 숫자는 아무도 안 본다.

/** 목록 한 줄에 들어가는 막대. 아직 한 번도 안 봤으면 아무것도 안 그린다. */
export function ReadMeter({ read }) {
  if (!read?.count) return null
  const label = lastReadLabel(read.lastAt)
  return (
    <span className="read-meter">
      <span className="read-meter__bar">
        <span
          className="read-meter__fill"
          style={{ width: `${Math.min(100, (read.count / READ_GOAL) * 100)}%` }}
        />
      </span>
      <span className="read-meter__text">
        {read.count}/{READ_GOAL}회독{label ? ` · ${label}` : ''}
      </span>
    </span>
  )
}

/**
 * 다 보고 나서 누르는 칸.
 *
 * @param unit  '회독' 대신 다른 말을 쓰고 싶을 때(구문독해는 '회차')
 */
export function ReadTracker({ read, onMark, onUndo, unit = '회독', verb = '읽음', timerKey = null }) {
  const label = lastReadLabel(read?.lastAt)
  const count = read?.count ?? 0
  const done = count >= READ_GOAL
  // 읽기 속도 — 챕터를 연 시점부터 읽음을 누를 때까지. timerKey(챕터)가
  // 바뀌면 다시 잰다. 속도는 유창성의 지표라 기록으로 남긴다.
  const startRef = useRef(Date.now())
  useEffect(() => {
    startRef.current = Date.now()
  }, [timerKey])
  const lastSpeed = secsLabel(read?.lastSecs)

  return (
    <div
      className="panel"
      style={{
        padding: 'var(--s3) var(--s4)',
        borderColor: done ? 'var(--accent-border)' : undefined,
        background: done ? 'var(--accent-soft)' : undefined,
      }}
    >
      <div className="row row--between">
        <span className="list__main">
          <span className="list__title">
            {count}/{READ_GOAL}
            {unit}
            {done ? ' — 목표 달성' : ''}
          </span>
          <span className="list__meta">
            {label ? `마지막으로 공부한 날 · ${label}` : `아직 ${verb} 표시를 하지 않았습니다`}
            {lastSpeed ? ` · 지난 속도 ${lastSpeed}` : ''}
          </span>
        </span>
        <div className="row" style={{ gap: 'var(--s1)' }}>
          {count > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={onUndo} title="잘못 눌렀을 때">
              −1
            </button>
          )}
          <button
            className="btn btn--sm"
            onClick={() =>
              onMark(timerKey != null ? Math.round((Date.now() - startRef.current) / 1000) : null)
            }
          >
            {verb}
          </button>
        </div>
      </div>
      <div className="progress" style={{ marginTop: 'var(--s2)' }}>
        <div
          className="progress__bar"
          style={{ width: `${Math.min(100, (count / READ_GOAL) * 100)}%` }}
        />
      </div>
    </div>
  )
}
