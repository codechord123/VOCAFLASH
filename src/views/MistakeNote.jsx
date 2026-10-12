import { useMemo, useState } from 'react'
import Swipe from './Swipe.jsx'
import { koToEnClue } from '../lib/clue.js'

// 오답 노트 — 틀린 것이 전부 모이는 한 권.
//
// 틀린 것은 여러 곳에서 생긴다: 수업 문항, 문법 연습, 관문 시험, 챕터
// 퀴즈, 말하기 🔴, 단어 스와이프의 '모름'. 각각 카드로 회수되고 있었지만
// 흩어져 있어서 '내가 무엇을 틀려 왔는지'를 한눈에 볼 곳이 없었다.
//
// 여기서는 출처별로 묶고, 각 카드가 지금 어디까지 왔는지(흔들림 → 익혀
// 가는 중 → 극복)를 보여준다. 노트의 목적은 쌓는 것이 아니라 비우는
// 것이라, 극복한 것을 세어 주고 흔들리는 것을 먼저 꺼내 준다.

const STAGE = (box) => (box >= 5 ? 'done' : box >= 3 ? 'mid' : 'weak')
const STAGE_LABEL = { weak: '흔들림', mid: '익혀 가는 중', done: '극복' }

/** 카드 → 오답 노트의 묶음 이름 */
function groupOf(c) {
  if (c.deck === 'mistake') {
    if (c.id.startsWith('card:miss-speak')) return '말하기'
    const work = c.source?.work ?? ''
    if (work.startsWith('문법')) return '문법'
    if (work.startsWith('구문')) return '구문'
    return '챕터 퀴즈'
  }
  if (c.type === 'line' || c.type === 'sentence') return '담은 문장'
  return '단어·표현'
}

const GROUP_ORDER = ['문법', '구문', '말하기', '챕터 퀴즈', '단어·표현', '담은 문장']
const GROUP_HINT = {
  문법: '문법 연습·수업·관문에서 틀린 문항',
  구문: '구문 퀴즈·수업·관문에서 틀린 문항',
  말하기: "말하기·암송에서 '못 했다'로 자평한 문장",
  '챕터 퀴즈': '원문 챕터 퀴즈에서 틀린 빈칸·배열',
  '단어·표현': '스와이프에서 모름으로 넘긴 적이 있는 것',
  '담은 문장': '문장 복습에서 모름으로 넘긴 적이 있는 것',
}

const order = (list) =>
  [...list].sort((a, b) => a.box - b.box || b.lapseCount - a.lapseCount || a.dueAt - b.dueAt)

export default function MistakeNote({ cards, settings, commit, onBack }) {
  const [filter, setFilter] = useState('weak') // weak | mid | done | all
  const [openGroup, setOpenGroup] = useState(null)
  const [swiping, setSwiping] = useState(null)

  // 오답 카드 전부 + 한 번이라도 모름으로 넘긴 카드
  const all = useMemo(
    () => cards.filter((c) => c.deck === 'mistake' || (c.lapseCount ?? 0) > 0),
    [cards]
  )

  const counts = useMemo(() => {
    const n = { weak: 0, mid: 0, done: 0 }
    for (const c of all) n[STAGE(c.box)] += 1
    return n
  }, [all])

  const shown = filter === 'all' ? all : all.filter((c) => STAGE(c.box) === filter)

  const groups = useMemo(() => {
    const m = new Map()
    for (const c of shown) {
      const g = groupOf(c)
      if (!m.has(g)) m.set(g, [])
      m.get(g).push(c)
    }
    return GROUP_ORDER.filter((g) => m.has(g)).map((g) => ({ name: g, cards: order(m.get(g)) }))
  }, [shown])

  if (swiping) {
    return (
      <Swipe
        cards={swiping}
        settings={settings}
        commit={commit}
        onExit={() => setSwiping(null)}
      />
    )
  }

  const weakAll = order(all.filter((c) => STAGE(c.box) === 'weak'))

  return (
    <div className="stack stack--loose">
      {onBack && (
        <header className="row row--between">
          <h1>오답 노트</h1>
          <button className="btn btn--ghost btn--sm" onClick={onBack}>← 오늘로</button>
        </header>
      )}

      {all.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">✓</div>
          <div className="empty__title">아직 틀린 것이 없습니다</div>
          <p className="empty__body">
            수업·연습·퀴즈에서 틀리거나 단어를 모름으로 넘기면 여기에 모입니다.
          </p>
        </div>
      ) : (
        <>
          <div className="panel stack stack--tight">
            <div className="mnote__stats">
              <div className="mnote__stat is-weak">
                <b>{counts.weak}</b>
                <span>흔들림</span>
              </div>
              <div className="mnote__stat is-mid">
                <b>{counts.mid}</b>
                <span>익혀 가는 중</span>
              </div>
              <div className="mnote__stat is-done">
                <b>{counts.done}</b>
                <span>극복</span>
              </div>
            </div>
            <div className="progress">
              <div
                className="progress__bar"
                style={{ width: `${(counts.done / all.length) * 100}%`, background: 'var(--good)' }}
              />
            </div>
            <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
              틀린 것 {all.length}개 중 {counts.done}개를 극복했습니다. 맞힐 때마다 간격이
              벌어지고, 다섯 번째 상자에 들어가면 극복입니다.
            </p>
          </div>

          {weakAll.length > 0 && (
            <button className="btn btn--primary btn--block" onClick={() => setSwiping(weakAll)}>
              흔들리는 것 {weakAll.length}개 몰아서 넘기기
            </button>
          )}

          <nav className="subtabs" role="tablist" aria-label="오답 노트 거르기">
            {[
              ['weak', `흔들림 ${counts.weak}`],
              ['mid', `익혀 가는 중 ${counts.mid}`],
              ['done', `극복 ${counts.done}`],
              ['all', `전체 ${all.length}`],
            ].map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={filter === id}
                className="tab"
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          {groups.length === 0 && (
            <p className="hint">이 칸은 비어 있습니다.</p>
          )}

          <section className="stack stack--tight">
            {groups.map((g) => {
              const isOpen = openGroup === g.name
              return (
                <div className="panel stack stack--tight" key={g.name} style={{ padding: 'var(--s3) var(--s4)' }}>
                  <div className="row row--between" style={{ gap: 'var(--s3)' }}>
                    <button
                      className="mnote__ghead"
                      onClick={() => setOpenGroup(isOpen ? null : g.name)}
                      aria-expanded={isOpen}
                    >
                      <span className="list__title">
                        {g.name} <span className="hint">{g.cards.length}</span> {isOpen ? '▴' : '▾'}
                      </span>
                      <span className="list__meta">{GROUP_HINT[g.name]}</span>
                    </button>
                    <button className="btn btn--sm" onClick={() => setSwiping(g.cards)}>
                      넘기기
                    </button>
                  </div>
                  {isOpen && (
                    <ul className="mnote__list">
                      {g.cards.slice(0, 60).map((c) => (
                        <MistakeRow key={c.id} card={c} />
                      ))}
                      {g.cards.length > 60 && (
                        <li className="hint">외 {g.cards.length - 60}개 — 넘기기로 전부 볼 수 있습니다</li>
                      )}
                    </ul>
                  )}
                </div>
              )
            })}
          </section>
        </>
      )}
    </div>
  )
}

/** 한 줄 — 앞면(문제)과 정답, 그리고 지금 어디까지 왔는지. */
function MistakeRow({ card }) {
  const [open, setOpen] = useState(false)
  const stage = STAGE(card.box)
  const clue = koToEnClue(card)
  return (
    <li className="mnote__row">
      <button className="mnote__q" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="mnote__front">{card.front}</span>
        {clue && !open && <span className="hint mnote__clue">{clue}</span>}
        {open && (
          <span className="mnote__back">
            <b>{card.back?.meaningKo ?? card.back?.en ?? '—'}</b>
            {card.back?.nuance && <span className="hint">{card.back.nuance}</span>}
          </span>
        )}
      </button>
      <span className={`mnote__badge is-${stage}`}>
        {STAGE_LABEL[stage]}
        {card.lapseCount > 1 ? ` · ${card.lapseCount}번 틀림` : ''}
      </span>
    </li>
  )
}
