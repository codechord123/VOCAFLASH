import { useMemo, useState } from 'react'
import Today from './Today.jsx'
import Vocab from './Vocab.jsx'
import Swipe from './Swipe.jsx'
import { selectDueCards, isDue } from '../lib/srs.js'
import { TOPICS } from '../lib/topics.js'

// 단어 파트. 복습 · 주제별 · 목록 세 화면.
//
// 순서에 의도가 있다. 매일 여는 것은 '복습'(오늘 볼 카드)이고, '주제별'은
// 특정 분야를 몰아서 볼 때, '목록'은 찾아볼 때 쓴다.
//
// 복습과 주제별 둘 다 스와이프로 넘긴다 — 카드를 세우는 방식만 다르고
// 넘기는 경험은 같다.

const SUB = [
  { id: 'review', label: '복습' },
  { id: 'topic', label: '주제별' },
  { id: 'list', label: '목록' },
]

export default function VocabPart({ cards, reviewCards, stats, settings, commit }) {
  const [sub, setSub] = useState('review')
  const [swiping, setSwiping] = useState(null) // 스와이프할 카드 배열

  const dueCards = useMemo(
    () => selectDueCards(reviewCards, { limit: settings.dailyLimit }),
    [reviewCards, settings.dailyLimit]
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
        <div className="stack stack--loose">
          {dueCards.length > 0 && (
            <button
              className="btn btn--primary btn--block"
              onClick={() => setSwiping(dueCards)}
            >
              스와이프로 {dueCards.length}개 넘기기
            </button>
          )}
          <Today
            cards={reviewCards}
            stats={stats}
            settings={settings}
            commit={commit}
            onGoTo={() => setSub('list')}
          />
        </div>
      )}

      {sub === 'topic' && (
        <TopicPicker cards={cards} onStart={(sel) => setSwiping(sel)} />
      )}

      {sub === 'list' && <Vocab cards={cards} commit={commit} />}
    </div>
  )
}

/**
 * 주제별 선택.
 *
 * B2 단어장 899개는 30주제 × 30단어로 나뉘어 있다. 시트에 Topic_ID
 * 숫자만 있어서 이름을 붙였다(lib/topics.js). 작품에서 나온 카드는
 * 작품별로 묶는다.
 */
function TopicPicker({ cards, onStart }) {
  const groups = useMemo(() => {
    const topic = new Map()
    const work = new Map()

    for (const c of cards) {
      if (c.topicId && TOPICS[c.topicId]) {
        const g = topic.get(c.topicId) ?? []
        g.push(c)
        topic.set(c.topicId, g)
      } else {
        const key = c.source?.work ?? '기타'
        const g = work.get(key) ?? []
        g.push(c)
        work.set(key, g)
      }
    }

    return {
      topics: [...topic.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([id, list]) => ({ id, ...TOPICS[id], cards: list })),
      works: [...work.entries()].map(([name, list]) => ({ name, cards: list })),
    }
  }, [cards])

  return (
    <div className="stack stack--loose">
      <p className="hint">
        주제를 골라 그 안의 단어만 몰아서 넘깁니다. 복습 예정일과 상관없이
        전부 나오고, 넘긴 결과는 복습 일정에 반영됩니다.
      </p>

      <section className="stack">
        <div className="section-title">작품에서 나온 표현</div>
        {groups.works.map((g) => (
          <GroupRow
            key={g.name}
            icon="◆"
            name={g.name}
            cards={g.cards}
            onStart={onStart}
          />
        ))}
      </section>

      <section className="stack">
        <div className="section-title">주제별 어휘</div>
        {groups.topics.map((g) => (
          <GroupRow
            key={g.id}
            icon={g.icon}
            name={g.name}
            cards={g.cards}
            onStart={onStart}
          />
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
