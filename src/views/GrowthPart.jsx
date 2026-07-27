import { useMemo } from 'react'
import { PLAN_DAYS, TOTAL_DAYS } from '../lib/plan.js'
import { UNIT_STAGES, ensureUnitSrs } from '../lib/unitSrs.js'
import { CAN_DO } from '../lib/cando.js'
import { NIGHT_STOPS } from '../lib/journey.js'

// 성장 화면 — 100일이 쌓이고 있다는 것을 눈으로 보는 곳.
//
// 숫자 하나(N일차)로는 길이 안 보인다. 여기서는 네 가지로 보인다:
// 유닛 지도(25칸의 색), 관문 점수의 추이, 출석 히트맵, can-do 사다리.
// 전부 이미 쌓인 기록에서 계산한다 — 새로 입력할 것은 없다.

const STAGE_CLASS = { 2: 'is-sprout', 3: 'is-grow', 4: 'is-root', 5: 'is-mine' }

export default function GrowthPart({ state, onBack }) {
  const plan = ensureUnitSrs(state.plan ?? { day: 1, checks: {}, history: {} }, PLAN_DAYS)
  const day = plan.day

  // 표의 등장 순서대로 25유닛과 그 상태
  const units = useMemo(() => {
    const seen = new Map()
    for (const r of PLAN_DAYS) {
      if (r.kind === 'learn' && r.unit && !seen.has(r.unit.id)) {
        seen.set(r.unit.id, { ...r.unit, firstDay: r.day })
      }
    }
    return [...seen.values()]
  }, [])

  const gates = Object.values(plan.gates ?? {}).sort((a, b) => a.day - b.day)

  // 예상 완주일 — 최근 완료 리듬으로 남은 날을 잰다
  const eta = useMemo(() => {
    const stamps = Object.values(plan.history ?? {}).sort((a, b) => a - b)
    const remaining = TOTAL_DAYS - day + 1
    if (remaining <= 0) return null
    const recent = stamps.slice(-10)
    const gap =
      recent.length >= 2
        ? (recent[recent.length - 1] - recent[0]) / (recent.length - 1)
        : 24 * 3600 * 1000
    return new Date(Date.now() + remaining * Math.max(gap, 12 * 3600 * 1000))
  }, [plan.history, day])

  // 출석 히트맵 — 최근 10주, 완료 도장이 찍힌 날짜들
  const heat = useMemo(() => {
    const done = new Set(
      Object.values(plan.history ?? {}).map((ts) => new Date(ts).toDateString())
    )
    const cells = []
    const today = new Date()
    for (let i = 69; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
      cells.push({
        key: d.toDateString(),
        done: done.has(d.toDateString()),
        isToday: i === 0,
      })
    }
    return cells
  }, [plan.history])

  const doneDays = Object.keys(plan.history ?? {}).length
  const badges = [
    { at: 33, label: '33일' },
    { at: 66, label: '66일' },
    { at: 100, label: '완주' },
  ]

  return (
    <div className="stack stack--loose">
      <header className="row row--between">
        <h1>성장</h1>
        <button className="btn btn--ghost btn--sm" onClick={onBack}>← 오늘로</button>
      </header>

      <div className="panel stack stack--tight">
        <div className="row row--between">
          <span>
            <b>{Math.min(day, TOTAL_DAYS)}일차</b> / {TOTAL_DAYS} · 완료 {doneDays}일
          </span>
          {eta && (
            <span className="hint">
              예상 완주 {eta.toLocaleDateString('ko', { month: 'long', day: 'numeric' })}
            </span>
          )}
        </div>
        <div className="progress">
          <div className="progress__bar" style={{ width: `${((day - 1) / TOTAL_DAYS) * 100}%` }} />
        </div>
        <div className="row" style={{ gap: 'var(--s2)' }}>
          {badges.map((b) => (
            <span key={b.at} className={`chip${day > b.at ? ' chip--accent' : ''}`}>
              {day > b.at ? '✓ ' : ''}{b.label}
            </span>
          ))}
        </div>
      </div>

      <section className="stack stack--tight">
        <div className="section-title">비엔나의 밤 — 지금 어디를 걷고 있나</div>
        <div className="stack stack--tight">
          {NIGHT_STOPS.map((s) => {
            const start = (s.cycle - 1) * 10 + 1
            const passed = day > s.cycle * 10
            const current = !passed && day >= start
            return (
              <div
                className="night-stop"
                key={s.cycle}
                style={{ opacity: passed || current ? 1 : 0.45 }}
              >
                <span className={`night-stop__dot${passed ? ' is-passed' : ''}${current ? ' is-current' : ''}`} />
                <span className="night-stop__place">
                  {s.place}
                  {current && <span className="chip chip--accent" style={{ marginLeft: 8 }}>지금 여기</span>}
                </span>
                <span className="hint">{passed ? '✓' : current ? s.note : `${start}일~`}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="stack stack--tight">
        <div className="section-title">유닛 지도 — 색이 채워지는 것이 실력이다</div>
        <div className="umap">
          {units.map((u) => {
            const s = plan.unitSrs?.[u.id]
            const started = u.firstDay <= day
            const cls = s ? STAGE_CLASS[s.srs] : started ? 'is-learning' : ''
            return (
              <div className={`umap__cell ${cls}`} key={u.id} title={u.title}>
                <span className="umap__no">{u.kind === 'syntax' ? '구' : '문'}{u.no}</span>
                <span className="umap__stage">
                  {s ? UNIT_STAGES[s.srs] : started ? '배우는 중' : '·'}
                </span>
              </div>
            )
          })}
        </div>
        <p className="hint" style={{ textAlign: 'left' }}>
          새싹 → 자람 → 뿌리 → 내 것. 복습에서 전부 맞히면 다음 단계로,
          틀리면 한 단계 내려와 다음 날 다시 돌아옵니다.
        </p>
      </section>

      <section className="stack stack--tight">
        <div className="section-title">관문 점수</div>
        {gates.length === 0 ? (
          <p className="hint" style={{ textAlign: 'left' }}>
            아직 관문 시험 전입니다. 매 사이클 7일차에 지금까지 전 범위로 시험을 봅니다.
          </p>
        ) : (
          <div className="stack stack--tight">
            {gates.map((g) => {
              const pct = g.total ? Math.round((g.right / g.total) * 100) : 0
              return (
                <div className="row" key={g.day} style={{ gap: 'var(--s3)', alignItems: 'center' }}>
                  <span className="chip chip--box">{g.day}일</span>
                  <div className="progress" style={{ flex: 1 }}>
                    <div
                      className="progress__bar"
                      style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--good)' : undefined }}
                    />
                  </div>
                  <span className="hint" style={{ minWidth: 64, textAlign: 'right' }}>
                    {g.right}/{g.total} ({pct}%)
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="stack stack--tight">
        <div className="section-title">최근 10주</div>
        <div className="heat">
          {heat.map((c) => (
            <div
              key={c.key}
              className={`heat__cell${c.done ? ' is-done' : ''}${c.isToday ? ' is-today' : ''}`}
              title={c.key}
            />
          ))}
        </div>
      </section>

      <section className="stack stack--tight">
        <div className="section-title">can-do 사다리 — 도달하면 할 수 있어야 하는 것</div>
        {CAN_DO.map((c) => {
          const reached = day > c.day
          const current = !reached && CAN_DO.find((x) => day <= x.day) === c
          return (
            <div
              className="panel stack stack--tight"
              key={c.day}
              style={{
                borderColor: current ? 'var(--accent-border)' : undefined,
                opacity: reached || current ? 1 : 0.55,
              }}
            >
              <div className="row row--between">
                <b>{c.phase}</b>
                <span className={`chip${reached ? ' chip--accent' : ''}`}>
                  {reached ? '✓ 지나옴' : `${c.day}일차까지`}
                </span>
              </div>
              {c.items.map((it) => (
                <p key={it} style={{ margin: 0, fontSize: 14 }}>· {it}</p>
              ))}
            </div>
          )
        })}
      </section>
    </div>
  )
}
