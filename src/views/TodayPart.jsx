import { TOTAL_DAYS, chapterLabel, completeDay, dayPlan, itemDone, toggleCheck } from '../lib/plan.js'

// 오늘의 공부 — 100일 커리큘럼의 오늘 치.
//
// 앱을 열면 제일 먼저 보는 화면이다. 탭마다 흩어진 숫자를 모으는 것이
// 아니라 "오늘은 이 셋"으로 좁혀 준다. 고르는 데 쓰는 힘이 제일 아깝다.
//
// 달력이 아니라 진도다. N일차를 끝내야 N+1일차가 열리고, 하루를 걸러도
// 계획은 그 자리에 있다 — 밀린 날짜가 쌓여 보이기 시작하면 앱을 접는다.

export default function TodayPart({ state, dueCount, commit, onGo }) {
  const plan = state.plan ?? { day: 1, checks: {}, history: {} }
  const finished = plan.day > TOTAL_DAYS

  if (finished) {
    return (
      <div className="empty">
        <div className="empty__icon">◆</div>
        <div className="empty__title">100일을 마쳤습니다</div>
        <p className="empty__body">
          유닛 25개와 회독 {Object.keys(plan.history).length}일 치가 쌓였습니다.
          이제부터는 복습과 회독이 이 앱의 본편입니다.
        </p>
      </div>
    )
  }

  const today = dayPlan(plan.day)
  const ctx = {
    dueCount,
    reads: state.reads,
    quizLog: state.quizLog,
    curriculum: state.curriculum,
    grammar: state.grammar,
    unit: today.unit,
    chapter: today.chapter,
  }
  const doneMap = Object.fromEntries(today.items.map((it) => [it.id, itemDone(it, plan, ctx)]))
  const doneCount = Object.values(doneMap).filter(Boolean).length
  const allDone = doneCount === today.items.length

  return (
    <div className="stack stack--loose">
      <header className="stack stack--tight">
        <div className="row row--between">
          <h1>{today.day}일차</h1>
          <span className="chip chip--box">
            {today.day} / {TOTAL_DAYS}
          </span>
        </div>
        <p className="hint">
          {today.unit.kind === 'syntax' ? '구문' : '문법'} {today.unit.no} ·{' '}
          {today.unit.title} — {['배우기', '되짚기', '내 것으로', '정리'][today.step - 1]} (
          {today.step}/4일)
        </p>
        <div className="progress">
          <div
            className="progress__bar"
            style={{ width: `${((today.day - 1) / TOTAL_DAYS) * 100}%` }}
          />
        </div>
      </header>

      <section className="stack stack--tight">
        {today.items.map((it) => {
          const done = doneMap[it.id]
          return (
            <div
              className="panel row row--between"
              key={it.id}
              style={{
                padding: 'var(--s3) var(--s4)',
                gap: 'var(--s3)',
                borderColor: done ? 'var(--accent-border)' : undefined,
                background: done ? 'var(--accent-soft)' : undefined,
              }}
            >
              {/* 체크는 손으로도 된다 — 앱이 못 보는 일(소리 내어 말하기)이 있다 */}
              <button
                className="today__check"
                aria-pressed={done}
                onClick={() => commit((s) => toggleCheck(s, it.id))}
                title={done ? '완료' : '직접 체크'}
              >
                {done ? '✓' : ''}
              </button>
              <span className="list__main" style={{ flex: 1 }}>
                <span
                  className="list__title"
                  style={done ? { textDecoration: 'line-through', color: 'var(--text-dim)' } : undefined}
                >
                  {it.label}
                </span>
                <span className="list__meta">{it.hint}</span>
              </span>
              {!done && (
                <button className="btn btn--sm" onClick={() => onGo(it.tab, it.chapter ?? null)}>
                  가기
                </button>
              )}
            </div>
          )
        })}
      </section>

      {allDone ? (
        <button
          className="btn btn--primary btn--block"
          onClick={() => commit((s) => completeDay(s))}
        >
          {today.day}일차 마치기 → 다음 날
        </button>
      ) : (
        <p className="hint">
          {doneCount}/{today.items.length} — 셋을 채우면 다음 날이 열립니다.
        </p>
      )}

      <RecentDays history={plan.history} currentDay={today.day} />
    </div>
  )
}

/** 지난 며칠. 달력 대신 흐름만 — 언제 했는지가 아니라 얼마나 왔는지. */
function RecentDays({ history, currentDay }) {
  const entries = Object.entries(history)
  if (entries.length === 0) return null
  const last = entries.slice(-7)
  return (
    <section className="stack stack--tight">
      <div className="section-title">지난 흐름</div>
      <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
        {last.map(([day, at]) => (
          <span className="chip" key={day}>
            {day}일차 · {new Date(at).toLocaleDateString('ko', { month: 'numeric', day: 'numeric' })}
          </span>
        ))}
        <span className="chip chip--accent">지금 {currentDay}일차</span>
      </div>
    </section>
  )
}
