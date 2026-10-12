import { useState } from 'react'
import { DAY_KIND_LABELS, PLAN_DAYS, TOTAL_DAYS, chapterLabel } from '../lib/plan.js'
import { UNIT_STAGES } from '../lib/unitSrs.js'
import { NIGHT_STOPS } from '../lib/journey.js'

// 전체 커리큘럼 — 100일을 한 장에.
//
// 오늘 화면은 오늘 치만 보여준다. 그래서 '지금 어디쯤이고, 앞에 무엇이
// 남았는지'가 안 보였다. 여기서는 10사이클을 밤의 정거장으로 펼치고,
// 사이클마다 열흘을 한 줄씩 보여준다. 지금 사이클은 펼쳐 둔 채로 연다.

const STEP_NAMES = ['배우기', '써먹기', '내 것으로']
const KIND_MARK = { learn: '', test: '관문', fluency: '유창성', produce: '말하기', milestone: '마무리' }

function rowTitle(r) {
  if (r.kind === 'learn' && r.unit) {
    const k = r.unit.kind === 'syntax' ? '구문' : '문법'
    return `${k} ${r.unit.no} · ${r.unit.title}`
  }
  return DAY_KIND_LABELS[r.kind] ?? r.kind
}

function rowSub(r) {
  if (r.kind === 'learn') return STEP_NAMES[(r.step ?? 1) - 1]
  if (r.kind === 'test') return '지금까지 전 범위 · 처음 보는 문항'
  if (r.kind === 'fluency') return '새것 없음 · 섀도잉과 재독'
  if (r.kind === 'produce') return '이번 사이클을 입으로'
  return '약점 되잡기 · 챕터 퀴즈'
}

export default function CurriculumMap({ plan, onBack }) {
  const day = plan.day
  const currentCycle = Math.min(Math.ceil(day / 10), 10)
  const [open, setOpen] = useState(() => new Set([currentCycle]))
  const history = plan.history ?? {}

  function toggle(c) {
    const next = new Set(open)
    if (next.has(c)) next.delete(c)
    else next.add(c)
    setOpen(next)
  }

  // 부(部) 구간 — 표에서 바로 읽는다
  const phases = []
  for (const r of PLAN_DAYS) {
    const last = phases[phases.length - 1]
    if (last && last.name === r.phase) last.to = r.day
    else phases.push({ name: r.phase, from: r.day, to: r.day })
  }

  return (
    <div className="stack stack--loose">
      <header className="row row--between">
        <h1>100일 커리큘럼</h1>
        <button className="btn btn--ghost btn--sm" onClick={onBack}>← 오늘로</button>
      </header>

      <div className="panel stack stack--tight">
        <p style={{ margin: 0 }}>
          열흘이 한 사이클입니다. <b>앞 6일</b>은 새 유닛을 배우고, <b>7일</b>째 관문
          시험, <b>8일</b>째 유창성, <b>9일</b>째 말하기, <b>10일</b>째 마무리.
          배운 유닛은 끝나지 않고 3→7→21일 간격으로 수업에 돌아옵니다.
        </p>
        <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
          {phases.map((p) => {
            const here = day >= p.from && day <= p.to
            return (
              <span key={p.name} className={`chip${here ? ' chip--accent' : ''}`}>
                {p.name} · {p.from}–{p.to}일
              </span>
            )
          })}
        </div>
      </div>

      <section className="stack stack--tight">
        {NIGHT_STOPS.map((stop) => {
          const rows = PLAN_DAYS.filter((r) => r.cycle === stop.cycle)
          const done = rows.filter((r) => history[r.day]).length
          const isOpen = open.has(stop.cycle)
          const isCurrent = stop.cycle === currentCycle && day <= TOTAL_DAYS
          // 이 사이클에서 새로 배우는 유닛들
          const units = []
          for (const r of rows) {
            if (r.kind === 'learn' && r.unit && !units.some((u) => u.id === r.unit.id)) units.push(r.unit)
          }
          return (
            <div
              key={stop.cycle}
              className="panel stack stack--tight cmap__cycle"
              style={{
                borderColor: isCurrent ? stop.tint : undefined,
                '--cycle-tint': stop.tint,
              }}
            >
              <button className="cmap__head" onClick={() => toggle(stop.cycle)} aria-expanded={isOpen}>
                <span className="cmap__dot" />
                <span className="list__main" style={{ flex: 1, textAlign: 'left' }}>
                  <span className="list__title">
                    {stop.cycle}사이클 · {stop.place}
                    {isCurrent && <span className="chip chip--accent" style={{ marginLeft: 8 }}>지금 여기</span>}
                  </span>
                  <span className="list__meta">
                    {rows[0].day}–{rows[rows.length - 1].day}일 ·{' '}
                    {units.map((u) => `${u.kind === 'syntax' ? '구' : '문'}${u.no}`).join(' · ')}
                  </span>
                </span>
                <span className="hint" style={{ minWidth: 40, textAlign: 'right' }}>
                  {done}/10 {isOpen ? '▴' : '▾'}
                </span>
              </button>

              {isOpen && (
                <ol className="cmap__days">
                  {rows.map((r) => {
                    const isDone = Boolean(history[r.day])
                    const isToday = r.day === day
                    const srs = r.graduates && r.unit ? plan.unitSrs?.[r.unit.id] : null
                    return (
                      <li
                        key={r.day}
                        className={`cmap__day${isDone ? ' is-done' : ''}${isToday ? ' is-today' : ''}${!isDone && !isToday ? ' is-ahead' : ''}`}
                      >
                        <span className="cmap__num">{isDone ? '✓' : r.day}</span>
                        <span className="list__main" style={{ flex: 1 }}>
                          <span className="cmap__title">
                            {KIND_MARK[r.kind] && <span className="cmap__kind">{KIND_MARK[r.kind]}</span>}
                            {rowTitle(r)}
                          </span>
                          <span className="list__meta">
                            {rowSub(r)} · {chapterLabel(r.chapter)}장
                            {r.kind === 'fluency' ? ' 재독' : ''}
                          </span>
                        </span>
                        {isToday && <span className="chip chip--accent">오늘</span>}
                        {srs && <span className="chip">{UNIT_STAGES[srs.srs]}</span>}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
