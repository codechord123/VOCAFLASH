import { useMemo, useState } from 'react'
import Swipe from './Swipe.jsx'
import { selectDueCards, isDue } from '../lib/srs.js'

// 문장 화면 — 단어 파트 안의 한 칸.
//
// 담은 것만 보여준다. 읽다가 ☆로 담은 대사·자막, 그어서 담은 토막,
// 그리고 구문 팝업에서 담은 표현이 전부다. 담지 않은 것은 여기 들어오지
// 않는다 — 즐겨찾기는 '내가 고른 것만 있는 곳'이어야 다시 열어 볼
// 마음이 생긴다.
//
// 구문(for weeks on end)까지 여기로 모으는 이유: 단어 파트는 한 단어만
// 남기도록 걸러서, 담은 구문이 거기서도 여기서도 안 보이는 자리가
// 있었다. 담았는데 어디에도 없으면 담기를 그만두게 된다.

/** 여기 들어올 카드인가. 담은 문장이거나, 읽다가 담은 여러 단어짜리 표현. */
function isSavedPiece(c) {
  if (c.type === 'line') return true
  return c.kind === 'phrase' && c.origin === 'reader-bookmark'
}

export default function LinePart({ cards, reviewCards, settings, commit }) {
  const [swiping, setSwiping] = useState(null)

  const saved = useMemo(() => cards.filter(isSavedPiece), [cards])
  const reviewable = useMemo(() => reviewCards.filter(isSavedPiece), [reviewCards])

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
      <Review
        dueCards={dueCards}
        saved={saved}
        onStart={(sel) => setSwiping(sel)}
      />
      {saved.length > 0 && <SavedList saved={saved} commit={commit} />}
    </div>
  )
}

function Review({ dueCards, saved, onStart }) {
  if (saved.length === 0) {
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

  const learned = saved.filter((c) => c.box === 5).length

  return (
    <div className="stack">
      {dueCards.length > 0 ? (
        <button className="btn btn--primary btn--block" onClick={() => onStart(dueCards)}>
          스와이프로 {dueCards.length}개 넘기기
        </button>
      ) : (
        <button className="btn btn--block" onClick={() => onStart(saved)}>
          오늘 볼 것 없음 — 담은 {saved.length}개 전부 넘기기
        </button>
      )}

      <div className="tiles">
        <div className="tile tile--accent">
          <div className="tile__value">{dueCards.length}</div>
          <div className="tile__label">오늘 볼 문장</div>
        </div>
        <div className="tile">
          <div className="tile__value">{saved.length}</div>
          <div className="tile__label">담은 문장·구문</div>
        </div>
        <div className="tile">
          <div className="tile__value">{learned}</div>
          <div className="tile__label">익힘</div>
        </div>
      </div>
    </div>
  )
}

/** 담은 문장 목록. 작품·챕터 순으로 묶고, 여기서 뺄 수도 있다. */
function SavedList({ saved, commit }) {
  const groups = useMemo(() => {
    const map = new Map()
    for (const c of saved) {
      // 구문 팝업에서 담은 것은 챕터가 없다. '?장'을 붙이면 없는 정보를
      // 있는 척하게 되므로 작품 이름만 쓴다.
      const work = c.source?.work ?? '기타'
      const key = c.source?.chapter != null ? `${work} · ${c.source.chapter}장` : work
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

  return (
    <div className="stack stack--loose">
      <p className="hint" style={{ textAlign: 'left' }}>
        담은 문장·구문 {saved.length}개. ★를 다시 누르면 뺍니다.
      </p>

      {groups.map((g) => (
        <section className="stack" key={g.name}>
          <div className="section-title">{g.name}</div>
          {g.list.map((c) => (
            <article className="panel stack stack--tight" key={c.id}>
              <div className="row row--between">
                <span className="chip">
                  {c.source?.speaker ?? (c.kind === 'phrase' ? '구문' : '자막')}
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
