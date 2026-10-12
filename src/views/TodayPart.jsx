import { Suspense, lazy, useState } from 'react'
import Icon from './Icon.jsx'
import GrowthPart from './GrowthPart.jsx'
import CurriculumMap from './CurriculumMap.jsx'
import MistakeNote from './MistakeNote.jsx'
import { DAY_KIND_LABELS, PLAN_DAYS, TOTAL_DAYS, chapterLabel, dayPlan, unitLabel } from '../lib/plan.js'
import { pauseSession, startSession } from '../lib/session.js'
import { dueReviewUnits, ensureUnitSrs } from '../lib/unitSrs.js'
import { nightTint } from '../lib/journey.js'

// 수업 진행기는 유닛 원자료(구문 211KB + 문법 55KB)를 통째로 들고
// 있어서 수업을 시작할 때 받는다.
const SessionRunner = lazy(() => import('./SessionRunner.jsx'))

// 오늘의 공부 — 100일 커리큘럼의 오늘 치.
//
// 버튼 하나로 시작하면 수업이 순서대로 끌고 간다(SessionRunner). 이
// 화면은 그 수업의 차례표와 시작 버튼, 그리고 세 방(전체 커리큘럼 ·
// 오답 노트 · 성장 기록)의 입구다. 무엇을 열지 고르는 일은 계획이 한다.
//
// 달력이 아니라 진도다. N일차를 끝내야 N+1일차가 열리고, 하루를 걸러도
// 계획은 그 자리에 있다.

export default function TodayPart({ state, cards, dueCards, settings, commit, onGuide }) {
  const plan = state.plan ?? { day: 1, checks: {}, history: {} }
  const finished = plan.day > TOTAL_DAYS
  // 오늘 화면 안의 다른 방들 — 전체 커리큘럼, 오답 노트, 성장 기록.
  // 탭을 늘리지 않는다. 오늘에서 들어가고 오늘로 돌아온다.
  const [room, setRoom] = useState(null) // null | 'map' | 'mistakes' | 'growth'
  // 사이클의 빛 — 정거장이 바뀌면 오늘 탭의 강조색이 함께 흐른다.
  // 기차의 앰버에서 노을, 밤, 새벽까지. 질리지 않는 건 변주다.
  const tint = nightTint(Math.min(Math.ceil(plan.day / 10), 10))
  const back = () => {
    setRoom(null)
    window.scrollTo({ top: 0 })
  }

  if (room === 'growth') {
    return (
      <div style={tint}>
        <GrowthPart state={state} onBack={back} />
      </div>
    )
  }
  if (room === 'map') {
    return (
      <div style={tint}>
        <CurriculumMap plan={plan} onBack={back} />
      </div>
    )
  }
  if (room === 'mistakes') {
    return (
      <div style={tint}>
        <MistakeNote cards={cards ?? []} settings={settings} commit={commit} onBack={back} />
      </div>
    )
  }

  const rooms = (
    <div className="today-rooms">
      <button className="today-room" onClick={() => setRoom('map')}>
        <Icon name="map" size={22} className="today-room__icon" />
        <span>전체 커리큘럼</span>
      </button>
      <button className="today-room" onClick={() => setRoom('mistakes')}>
        <Icon name="note" size={22} className="today-room__icon" />
        <span>오답 노트</span>
      </button>
      <button className="today-room" onClick={() => setRoom('growth')}>
        <Icon name="trend" size={22} className="today-room__icon" />
        <span>성장 기록</span>
      </button>
    </div>
  )

  if (finished) {
    return (
      <div className="stack stack--loose">
        <div className="empty">
          <div className="empty__icon">◆</div>
          <div className="empty__title">100일을 마쳤습니다</div>
          <p className="empty__body">
            유닛 25개와 회독 {Object.keys(plan.history).length}일 치가 쌓였습니다.
            이제부터는 복습과 회독이 이 앱의 본편입니다.
          </p>
        </div>
        {rooms}
      </div>
    )
  }

  // 진행 중인 수업이 있으면 그 자리에서 이어간다 — 이 화면의 본편이다.
  if (plan.session && plan.session.day === plan.day && !plan.session.paused) {
    return (
      <div style={tint}>
        <Suspense fallback={<p className="hint">수업을 불러오는 중…</p>}>
          <SessionRunner
            state={state}
            cards={cards ?? []}
            dueCards={dueCards}
            settings={settings}
            commit={commit}
            onGuide={onGuide}
          />
        </Suspense>
      </div>
    )
  }

  const today = dayPlan(plan.day)
  // 오늘 카드에 섞인 오답 카드 수 — 수업 첫머리 되잡기에 쓰인다
  const mistakeDue = dueCards.filter((c) => c.deck === 'mistake').length
  // 오늘 수업에 돌아올 복습 유닛 — 실제 세션이 뽑는 것과 같은 상위 2개.
  // 관문 시험 날은 시험이 복습이라 예고하지 않는다.
  const dueReview =
    today.kind === 'test'
      ? []
      : dueReviewUnits(ensureUnitSrs(plan, PLAN_DAYS).unitSrs, plan.day)
          .filter((u) => u.id !== today.unit?.id)
          .slice(0, 2)
  const resuming = plan.session?.day === plan.day
  const wordCount = Math.min(dueCards.length, settings?.dailyLimit ?? 20)

  // 오늘 수업의 차례. 예전에는 단어·과업·회독 세 칸을 체크리스트로 두고
  // 칸마다 '가기'가 있었는데, 수업 하나가 이미 전부를 순서대로 끌고 가서
  // 같은 일을 두 번 말하고 있었다. 이제 이것은 문이 아니라 차례표다.
  const mainLine =
    today.kind === 'learn'
      ? `${today.unit.kind === 'syntax' ? '구문' : '문법'} ${today.unit.no} · ${today.unit.title} — ${['배우기', '되짚기', '내 것으로'][today.step - 1]}`
      : today.items.find((it) => it.id === 'main')?.label ?? DAY_KIND_LABELS[today.kind]
  const steps = [
    mistakeDue > 0 && { icon: 'rotate', text: `틀렸던 것 되잡기 ${Math.min(mistakeDue, today.kind === 'milestone' ? 6 : 4)}개` },
    dueReview.length > 0 && {
      icon: 'rotate',
      text: `돌아온 유닛 — ${dueReview.map((u) => unitLabel(u.id)).join(' · ')}`,
    },
    { icon: 'diamond', text: mainLine, main: true },
    { icon: 'sparkle', text: `오늘의 영화 표현 ${today.day === TOTAL_DAYS ? 10 : 5}개` },
    wordCount > 0 && { icon: 'cards', text: `단어 카드 ${wordCount}장` },
    {
      icon: 'book',
      text: `${chapterLabel(today.chapter)}장 ${today.kind === 'fluency' ? '재독 — 빠르게' : '회독'}${today.kind === 'milestone' ? ' + 챕터 퀴즈' : ''}`,
    },
  ].filter(Boolean)

  return (
    <div className="stack stack--loose" style={tint}>
      <header className="stack stack--tight">
        <div className="row row--between">
          <h1>{today.day}일차</h1>
          <div className="row" style={{ gap: 'var(--s2)' }}>
            {/* 지금 어느 장(부)을 지나는지 — 100이라는 숫자만 보이면
                길이 안 보인다. 이름 붙은 구간이 있어야 지도가 된다. */}
            <span className="chip chip--accent">{today.phase}</span>
            <button
              className="chip chip--box"
              style={{ cursor: 'pointer' }}
              onClick={() => setRoom('map')}
              title="전체 커리큘럼"
            >
              {today.day} / {TOTAL_DAYS}
            </button>
          </div>
        </div>
        <p className="hint">
          {today.cycle}사이클 {today.dayInCycle}/10일 · {DAY_KIND_LABELS[today.kind]}
        </p>
        <div className="progress">
          <div
            className="progress__bar"
            style={{ width: `${((today.day - 1) / TOTAL_DAYS) * 100}%` }}
          />
        </div>
      </header>

      <section className="panel stack stack--tight">
        <div className="section-title">오늘 수업의 차례</div>
        <ol className="today-steps">
          {steps.map((st, i) => (
            <li key={i} className={st.main ? 'is-main' : undefined}>
              <Icon name={st.icon} size={16} className="today-steps__icon" />
              <span>{st.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <button
        className="btn btn--primary btn--block"
        onClick={() =>
          commit((s) =>
            s.plan?.session?.day === s.plan?.day
              ? pauseSession(s, false) // 멈춰 둔 수업 — 그 원자에서 이어간다
              : startSession(s)
          )
        }
      >
        {resuming ? '수업 이어서 하기' : `${today.day}일차 수업 시작`}
      </button>

      {rooms}

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
