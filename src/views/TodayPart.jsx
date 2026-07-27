import { useState } from 'react'
import Swipe from './Swipe.jsx'
import { TOTAL_DAYS, completeDay, dayPlan, itemDone, toggleCheck } from '../lib/plan.js'

// 오늘의 공부 — 100일 커리큘럼의 오늘 치.
//
// 버튼 하나로 시작하면 앱이 순서대로 끌고 간다: 단어는 이 화면에서 바로
// 넘기고, 과업과 회독은 그날의 유닛·챕터를 열어 준 채 아래에 안내 바가
// 따라간다. 따라 하는 사람이 할 일은 넘기고, 풀고, 읽는 것뿐이다 —
// 무엇을 열지 고르는 일은 계획이 한다.
//
// 달력이 아니라 진도다. N일차를 끝내야 N+1일차가 열리고, 하루를 걸러도
// 계획은 그 자리에 있다.

export default function TodayPart({ state, dueCards, settings, commit, onGuide }) {
  const plan = state.plan ?? { day: 1, checks: {}, history: {} }
  const finished = plan.day > TOTAL_DAYS
  // 단어 단계는 이 화면 안에서 바로 넘긴다 — 탭을 오가는 것부터가 일이다.
  // 시작할 때의 묶음을 붙잡아 둔다. 살아 있는 목록을 그대로 넘기면
  // 채점된 카드가 넘어가는 애니메이션 중에 목록에서 빠져 화면이 죽는다.
  const [swipeCards, setSwipeCards] = useState(null)

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
    dueCount: dueCards.length,
    reviewLog: state.reviewLog,
    dailyLimit: settings?.dailyLimit ?? 20,
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
  const firstOpen = today.items.find((it) => !doneMap[it.id]) ?? null

  /** 다음 할 일로 끌고 간다. 단어면 여기서 카드를 펴고, 아니면 그 자리를 연다. */
  function goNext(from = firstOpen) {
    if (!from) return
    if (from.id === 'word' && dueCards.length > 0) {
      setSwipeCards(dueCards)
      return
    }
    onGuide(from, today)
  }

  // 단어를 넘기는 중 — 오늘 화면이 그대로 카드 화면이 된다
  if (swipeCards) {
    return (
      <div className="stack stack--loose">
        <p className="hint" style={{ textAlign: 'left' }}>
          오늘 1/3 · 단어 — 다 넘기면 다음으로 이어집니다
        </p>
        <Swipe
          cards={swipeCards}
          settings={settings}
          commit={commit}
          onExit={() => {
            setSwipeCards(null)
            // 오늘 몫을 채웠을 때만 다음 칸으로 잇는다. 중간에 나간
            // 것은 그만두겠다는 뜻이지 다음으로 가겠다는 뜻이 아니다.
            if (!doneMap.word) return
            const next = today.items.find((it) => it.id !== 'word' && !doneMap[it.id])
            if (next) onGuide(next, today)
          }}
        />
      </div>
    )
  }

  return (
    <div className="stack stack--loose">
      <header className="stack stack--tight">
        <div className="row row--between">
          <h1>{today.day}일차</h1>
          <div className="row" style={{ gap: 'var(--s2)' }}>
            {/* 지금 어느 장(부)을 지나는지 — 100이라는 숫자만 보이면
                길이 안 보인다. 이름 붙은 구간이 있어야 지도가 된다. */}
            <span className="chip chip--accent">{today.phase}</span>
            <span className="chip chip--box">
              {today.day} / {TOTAL_DAYS}
            </span>
          </div>
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

      {/* 시작 버튼이 이 화면의 본체다. 목록은 어디까지 왔는지 보는 용도. */}
      {!allDone && (
        <button className="btn btn--primary btn--block" onClick={() => goNext()}>
          {doneCount === 0 ? '오늘 시작하기' : `이어서 하기 (${doneCount}/3)`}
        </button>
      )}

      <section className="stack stack--tight">
        {today.items.map((it, i) => {
          const done = doneMap[it.id]
          const current = firstOpen?.id === it.id
          return (
            <div
              className="panel row row--between"
              key={it.id}
              style={{
                padding: 'var(--s3) var(--s4)',
                gap: 'var(--s3)',
                borderColor: done ? 'var(--accent-border)' : current ? 'var(--border-strong)' : undefined,
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
                {done ? '✓' : i + 1}
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
              {!done && !current && (
                <button className="btn btn--ghost btn--sm" onClick={() => goNext(it)}>
                  가기
                </button>
              )}
            </div>
          )
        })}
      </section>

      {allDone && (
        <button
          className="btn btn--primary btn--block"
          onClick={() => commit((s) => completeDay(s))}
        >
          {today.day}일차 마치기 → 다음 날
        </button>
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
