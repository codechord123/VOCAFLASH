import { useMemo, useState } from 'react'
import Vocab from './Vocab.jsx'
import Swipe from './Swipe.jsx'
import { selectDueCards, isDue, deckStats } from '../lib/srs.js'
import { filterByLevel } from '../lib/level.js'

// 단어 파트. 복습 · 묶음 · 목록 세 화면.
//
// 복습은 스와이프 하나로 한다. 예전에는 버튼식 카드 화면이 아래에 같이
// 있었는데, 같은 카드를 두 방식으로 보여주는 것은 선택을 강요할 뿐
// 도움이 안 된다. 넘기는 방식은 하나면 된다.

const SUB = [
  { id: 'review', label: '복습' },
  { id: 'topic', label: '묶음' },
  { id: 'list', label: '목록' },
]

export default function VocabPart({ cards, reviewCards, settings, commit }) {
  const [sub, setSub] = useState('review')
  const [swiping, setSwiping] = useState(null)

  const hideBasic = settings.hideBasicWords !== false

  // 기초 단어(have, been 같은 조동사 한 개짜리)는 카드에서 뺀다.
  // 지우지 않고 가리는 것이라 설정에서 되돌릴 수 있다.
  const studyCards = useMemo(
    () => filterByLevel(cards, { hideBasic }),
    [cards, hideBasic]
  )
  const studyReviewCards = useMemo(
    () => filterByLevel(reviewCards, { hideBasic }),
    [reviewCards, hideBasic]
  )

  const dueCards = useMemo(
    () => selectDueCards(studyReviewCards, { limit: settings.dailyLimit }),
    [studyReviewCards, settings.dailyLimit]
  )
  const stats = useMemo(() => deckStats(studyReviewCards), [studyReviewCards])

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
      <nav className="subtabs" role="tablist" aria-label="단어 파트 화면">
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

      {sub === 'review' && (
        <Review
          dueCards={dueCards}
          stats={stats}
          onStart={() => setSwiping(dueCards)}
          onGoTopic={() => setSub('topic')}
        />
      )}

      {sub === 'topic' && (
        <TopicPicker cards={studyCards} onStart={(sel) => setSwiping(sel)} />
      )}

      {sub === 'list' && <Vocab cards={studyCards} commit={commit} />}
    </div>
  )
}

function Review({ dueCards, stats, onStart, onGoTopic }) {
  if (dueCards.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">✓</div>
        <div className="empty__title">오늘 볼 카드가 없습니다</div>
        <p className="empty__body">
          예정된 복습을 다 끝냈습니다. 더 하고 싶으면 묶음을 골라 넘겨
          보세요 — 복습 예정일과 상관없이 그 묶음 전체가 나옵니다.
        </p>
        <button className="btn btn--primary" onClick={onGoTopic}>
          묶음 고르기
        </button>
      </div>
    )
  }

  return (
    <div className="stack stack--loose">
      <button className="btn btn--primary btn--block" onClick={onStart}>
        스와이프로 {dueCards.length}개 넘기기
      </button>

      <div className="tiles">
        <div className="tile tile--accent">
          <div className="tile__value">{dueCards.length}</div>
          <div className="tile__label">오늘 볼 카드</div>
        </div>
        <div className="tile">
          <div className="tile__value">{stats.fresh.toLocaleString('ko')}</div>
          <div className="tile__label">아직 안 본 것</div>
        </div>
        <div className="tile">
          <div className="tile__value">{stats.learned.toLocaleString('ko')}</div>
          <div className="tile__label">익힘</div>
        </div>
        <div className="tile">
          <div className="tile__value">{stats.total.toLocaleString('ko')}</div>
          <div className="tile__label">전체</div>
        </div>
      </div>

      <section className="stack stack--tight">
        <div className="section-title">박스별 분포</div>
        <p className="hint">
          박스가 오를수록 다시 보는 간격이 길어집니다 — 1·3·7·14·30일.
          틀리면 1번으로 돌아갑니다.
        </p>
        {stats.byBox.map((n, i) => (
          <div className="meter-row" key={i}>
            <div className="meter-row__label">
              <span>박스 {i + 1}</span>
              <span>{n.toLocaleString('ko')}</span>
            </div>
            <div className="progress">
              <div
                className="progress__bar"
                style={{
                  width: stats.total ? `${(n / stats.total) * 100}%` : '0%',
                }}
              />
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

/**
 * 묶음 선택. 카드를 덱(하이라이트/메모)별로 묶어 몰아서 넘긴다.
 * 커리큘럼 유닛이 생기면 유닛별 묶음이 여기에 추가된다.
 */
function TopicPicker({ cards, onStart }) {
  const groups = useMemo(() => {
    const byDeck = new Map()
    for (const c of cards) {
      const key = c.deck === 'note' ? '내 메모' : c.source?.work ?? '기타'
      const g = byDeck.get(key) ?? []
      g.push(c)
      byDeck.set(key, g)
    }
    return [...byDeck.entries()].map(([name, list]) => ({ name, cards: list }))
  }, [cards])

  return (
    <div className="stack stack--loose">
      <p className="hint">
        묶음을 골라 그 안의 단어만 몰아서 넘깁니다. 복습 예정일과 상관없이
        전부 나오고, 넘긴 결과는 복습 일정에 반영됩니다.
      </p>

      <section className="stack">
        <div className="section-title">묶음</div>
        {groups.map((g) => (
          <GroupRow key={g.name} icon="◆" name={g.name} cards={g.cards} onStart={onStart} />
        ))}
      </section>
    </div>
  )
}

function GroupRow({ icon, name, cards, onStart }) {
  const due = cards.filter((c) => isDue(c)).length
  const fresh = cards.filter((c) => c.reviewCount === 0).length
  const learned = cards.filter((c) => c.box === 5).length

  return (
    <div className="panel" style={{ padding: 'var(--s3) var(--s4)' }}>
      <div className="row row--between">
        <span className="list__main">
          <span className="list__title">
            <span aria-hidden="true" style={{ marginRight: 6 }}>
              {icon}
            </span>
            {name}
          </span>
          <span className="list__meta">
            {cards.length}개 · 안 본 것 {fresh} · 익힘 {learned}
            {due > 0 && ` · 오늘 ${due}`}
          </span>
        </span>
        <button className="btn btn--sm" onClick={() => onStart(cards)}>
          넘기기
        </button>
      </div>
      {/* 진도를 한 줄로 — 어느 주제를 이미 했는지 보여야 다음 걸 고른다 */}
      <div className="progress" style={{ marginTop: 'var(--s2)' }}>
        <div
          className="progress__bar"
          style={{ width: `${(learned / cards.length) * 100}%` }}
        />
      </div>
    </div>
  )
}
