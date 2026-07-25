import { useMemo, useState } from 'react'
import { MAX_BOX, isDue } from '../lib/srs.js'
import { COLOR_LABELS, KIND_LABELS } from '../lib/deck.js'

// 단어장. 누적 자산을 한 곳에서 보는 화면.
//
// `어려운 표현 정리`가 노션에서 2개에서 멈춘 건 통합 목록을 볼 곳이
// 없었기 때문이다. 여기가 그 자리다 — 검색·필터·정렬이 있어야
// 수백 개가 쌓여도 죽지 않는다.

const SORTS = [
  { id: 'chapter', label: '챕터 순' },
  { id: 'box', label: '덜 외운 것 먼저' },
  { id: 'alpha', label: '가나다·ABC' },
  { id: 'lapse', label: '자주 틀린 것' },
]

export default function Vocab({ cards, commit }) {
  const all = useMemo(() => cards.filter((c) => c.type === 'expression'), [cards])

  const [q, setQ] = useState('')
  const [work, setWork] = useState('all')
  const [kind, setKind] = useState('all')
  const [sort, setSort] = useState('chapter')
  const [onlyNoMeaning, setOnlyNoMeaning] = useState(false)

  const works = useMemo(
    () => [...new Set(all.map((c) => c.source?.work).filter(Boolean))],
    [all]
  )

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = all.filter((c) => {
      if (work !== 'all' && c.source?.work !== work) return false
      if (kind !== 'all' && c.kind !== kind) return false
      if (onlyNoMeaning && c.back) return false
      if (!needle) return true
      return (
        c.front.toLowerCase().includes(needle) ||
        (c.back?.meaningKo ?? '').toLowerCase().includes(needle) ||
        (c.context ?? '').toLowerCase().includes(needle)
      )
    })

    const byChapter = (a, b) =>
      (a.source?.chapter ?? 99) - (b.source?.chapter ?? 99) ||
      a.front.localeCompare(b.front)

    if (sort === 'chapter') out = out.sort(byChapter)
    if (sort === 'box') out = out.sort((a, b) => a.box - b.box || byChapter(a, b))
    if (sort === 'alpha') out = out.sort((a, b) => a.front.localeCompare(b.front, 'ko'))
    if (sort === 'lapse')
      out = out.sort((a, b) => b.lapseCount - a.lapseCount || byChapter(a, b))

    return out
  }, [all, q, work, kind, sort, onlyNoMeaning])

  const noMeaningCount = useMemo(() => all.filter((c) => !c.back).length, [all])

  return (
    <div className="stack stack--loose">
      <div className="row row--between">
        <div>
          <h1>단어장</h1>
          <p className="hint" style={{ marginTop: 'var(--s2)' }}>
            표현 {all.length}개 · 검색 결과 {rows.length}개
          </p>
        </div>
      </div>

      {noMeaningCount > 0 && (
        <div className="notice notice--warn">
          <span className="notice__icon">!</span>
          <span>
            뜻이 없는 표현이 {noMeaningCount}개 있습니다. 본인이 하이라이트만
            해둔 것으로, 뜻풀이는 Claude Code에서 생성해 넣습니다.{' '}
            <button
              className="btn btn--sm btn--ghost"
              onClick={() => setOnlyNoMeaning((v) => !v)}
            >
              {onlyNoMeaning ? '전체 보기' : '이것만 보기'}
            </button>
          </span>
        </div>
      )}

      <div className="panel stack">
        <div className="field">
          <input
            className="input"
            type="search"
            placeholder="표현·뜻·문맥 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="row">
          <Select label="작품" value={work} onChange={setWork} options={[['all', '전체'], ...works.map((w) => [w, w])]} />
          <Select
            label="종류"
            value={kind}
            onChange={setKind}
            options={[['all', '전체'], ...Object.entries(KIND_LABELS)]}
          />
          <Select label="정렬" value={sort} onChange={setSort} options={SORTS.map((s) => [s.id, s.label])} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">○</div>
          <div className="empty__title">조건에 맞는 표현이 없습니다</div>
          <p className="empty__body">검색어나 필터를 바꿔 보세요.</p>
        </div>
      ) : (
        <div className="panel panel--flush">
          <div className="list">
            {rows.map((c) => (
              <Row key={c.id} card={c} commit={commit} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ card, commit }) {
  const [open, setOpen] = useState(false)
  const due = isDue(card)

  return (
    <div className="list__item" style={{ display: 'block' }}>
      <div className="row" style={{ gap: 'var(--s3)' }}>
        <button
          className="btn btn--ghost btn--sm"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{ minWidth: 28, padding: 0 }}
        >
          {open ? '−' : '+'}
        </button>
        <span className="list__main">
          <span className="read" style={{ fontSize: 17 }}>{card.front}</span>
          <span className="list__meta">
            {card.back?.meaningKo ?? '뜻 없음'}
          </span>
        </span>
        <span className="row" style={{ gap: 'var(--s1)', flexWrap: 'nowrap' }}>
          {card.origin === 'learner-highlight' && <span className="chip chip--accent">내 표시</span>}
          {card.origin === 'learner-note' && <span className="chip chip--accent">내 메모</span>}
          {card.color && COLOR_LABELS[card.color] && (
            <span className="chip">{COLOR_LABELS[card.color]}</span>
          )}
          {due && <span className="chip">복습 예정</span>}
          <span className="chip chip--box">{card.box}/{MAX_BOX}</span>
        </span>
      </div>

      {open && (
        <div className="stack stack--tight" style={{ padding: 'var(--s3) 0 var(--s2) 40px' }}>
          {card.back?.definitionEn && (
            <p className="ko" style={{ fontStyle: 'italic' }}>{card.back.definitionEn}</p>
          )}
          {card.back?.nuance && <p className="hint">뉘앙스 — {card.back.nuance}</p>}
          {card.context && <div className="flashcard__context">{card.context}</div>}
          <div className="row">
            {card.source?.chapterTitle && (
              <span className="list__meta">{card.source.chapterTitle}</span>
            )}
            {card.source?.speaker && <span className="chip">{card.source.speaker}</span>}
            <span className="spacer" />
            <span className="list__meta">
              복습 {card.reviewCount}회 · 틀림 {card.lapseCount}회
            </span>
          </div>
          <div className="row">
            <button
              className="btn btn--sm"
              onClick={() =>
                commit((s) => ({
                  ...s,
                  cards: s.cards.map((x) =>
                    x.id === card.id ? { ...x, box: 1, dueAt: 0 } : x
                  ),
                }))
              }
            >
              다시 처음부터
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="field" style={{ flex: 1, minWidth: 130 }}>
      <span className="label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}
