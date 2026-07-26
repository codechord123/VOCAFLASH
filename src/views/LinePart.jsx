import { useMemo, useState } from 'react'
import Swipe from './Swipe.jsx'
import { selectDueCards, isDue } from '../lib/srs.js'

// 문장 파트.
//
// 단어와 나눈 이유는 외우는 방식이 달라서다. 단어는 1초에 알거나 모르거나가
// 갈리지만, 문장은 읽고 뜻을 떠올리는 데 시간이 걸린다. 같은 덱에 섞으면
// 스와이프의 리듬이 매번 끊긴다.
//
// 여기 들어오는 것은 두 종류다:
//   담은 문장  — 읽다가 ☆로 담은 대사·자막
//   내 하이라이트 — 노션에서 표시한 구문·문장 (단어가 아니라 여기 산다)

const SUB = [
  { id: 'review', label: '복습' },
  { id: 'list', label: '목록' },
]

export default function LinePart({ cards, reviewCards, settings, commit }) {
  const [sub, setSub] = useState('review')
  const [swiping, setSwiping] = useState(null)

  // 문장 파트가 다루는 카드: 담은 줄 + 단어가 아닌 하이라이트(구문·문장).
  const isLineish = (c) =>
    c.type === 'line' || (c.type === 'expression' && /\s/.test((c.front ?? '').trim()))

  const all = useMemo(() => cards.filter(isLineish), [cards])
  const reviewable = useMemo(() => reviewCards.filter(isLineish), [reviewCards])
  const saved = useMemo(() => all.filter((c) => c.type === 'line'), [all])

  const dueCards = useMemo(
    () => selectDueCards(reviewable, { limit: settings.dailyLimit }),
    [reviewable, settings.dailyLimit]
  )

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

  return (
    <div className="stack stack--loose">
      <nav className="subtabs" role="tablist" aria-label="문장 파트 화면">
        {SUB.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={sub === s.id}
            className="tab"
            onClick={() => setSub(s.id)}
          >
            {s.label}
            {s.id === 'review' && dueCards.length > 0 && (
              <span className="tab__count">{dueCards.length}</span>
            )}
          </button>
        ))}
      </nav>

      {sub === 'review' ? (
        <Review
          dueCards={dueCards}
          all={all}
          saved={saved}
          onStart={(sel) => setSwiping(sel)}
          onGoList={() => setSub('list')}
        />
      ) : (
        <SavedList saved={saved} commit={commit} />
      )}
    </div>
  )
}

function Review({ dueCards, all, saved, onStart, onGoList }) {
  if (all.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">☆</div>
        <div className="empty__title">담아 둔 문장이 없습니다</div>
        <p className="empty__body">
          읽기 화면에서 마음에 걸리는 줄의 ☆를 누르면 여기 쌓입니다.
          비포 선라이즈는 인물 대사 한 줄, 나머지 두 편은 자막 한 줄이
          단위입니다.
        </p>
      </div>
    )
  }

  const highlights = all.length - saved.length

  return (
    <div className="stack stack--loose">
      {dueCards.length > 0 ? (
        <button className="btn btn--primary btn--block" onClick={() => onStart(dueCards)}>
          스와이프로 {dueCards.length}개 넘기기
        </button>
      ) : (
        <div className="empty">
          <div className="empty__icon">✓</div>
          <div className="empty__title">오늘 볼 문장이 없습니다</div>
          <p className="empty__body">
            예정된 복습을 다 끝냈습니다. 그래도 더 보고 싶으면 아래에서
            전체를 넘길 수 있습니다.
          </p>
        </div>
      )}

      <div className="tiles">
        <div className="tile tile--accent">
          <div className="tile__value">{dueCards.length}</div>
          <div className="tile__label">오늘 볼 문장</div>
        </div>
        <div className="tile">
          <div className="tile__value">{saved.length}</div>
          <div className="tile__label">담은 문장</div>
        </div>
        <div className="tile">
          <div className="tile__value">{highlights}</div>
          <div className="tile__label">내 하이라이트</div>
        </div>
      </div>

      <div className="row">
        <button className="btn" onClick={() => onStart(all)}>
          전체 {all.length}개 넘기기
        </button>
        {saved.length > 0 && (
          <button className="btn" onClick={() => onStart(saved)}>
            담은 것만 {saved.length}개
          </button>
        )}
        <button className="btn btn--ghost" onClick={onGoList}>
          목록 보기
        </button>
      </div>
    </div>
  )
}

/** 담은 문장 목록. 작품·챕터 순으로 묶고, 여기서 뺄 수도 있다. */
function SavedList({ saved, commit }) {
  const groups = useMemo(() => {
    const map = new Map()
    for (const c of saved) {
      const key = `${c.source?.work ?? '기타'} · ${c.source?.chapter ?? '?'}장`
      const g = map.get(key) ?? []
      g.push(c)
      map.set(key, g)
    }
    return [...map.entries()].map(([name, list]) => ({
      name,
      list: [...list].sort((a, b) => (a.lineIndex ?? 0) - (b.lineIndex ?? 0)),
    }))
  }, [saved])

  function remove(id) {
    commit((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== id) }))
  }

  if (saved.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">☆</div>
        <div className="empty__title">담아 둔 문장이 없습니다</div>
        <p className="empty__body">읽기 화면에서 ☆를 눌러 담아 보세요.</p>
      </div>
    )
  }

  return (
    <div className="stack stack--loose">
      <p className="hint" style={{ textAlign: 'left' }}>
        담은 문장 {saved.length}개. ★를 다시 누르면 뺍니다.
      </p>

      {groups.map((g) => (
        <section className="stack" key={g.name}>
          <div className="section-title">{g.name}</div>
          {g.list.map((c) => (
            <article className="panel stack stack--tight" key={c.id}>
              <div className="row row--between">
                <span className="chip">
                  {c.source?.speaker ?? '자막'}
                  {isDue(c) ? ' · 복습 예정' : ''}
                </span>
                <button
                  className="star is-on"
                  onClick={() => remove(c.id)}
                  title="즐겨찾기에서 빼기"
                >
                  ★
                </button>
              </div>
              <p className="read" style={{ margin: 0 }}>
                {c.front}
              </p>
              {c.back?.meaningKo ? (
                <p className="ko" style={{ margin: 0 }}>
                  {c.back.meaningKo}
                </p>
              ) : (
                <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
                  번역 없음 — 원문으로 뜻을 떠올려 보세요
                </p>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  )
}
