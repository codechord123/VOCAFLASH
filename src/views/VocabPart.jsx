import { useMemo, useState } from 'react'
import Vocab from './Vocab.jsx'
import Swipe from './Swipe.jsx'
import LinePart from './LinePart.jsx'
import { selectDueCards, isDue, deckStats } from '../lib/srs.js'
import { filterByLevel } from '../lib/level.js'
import { TOPICS } from '../lib/topics.js'

// 외우는 것들이 모이는 파트. 복습 · 주제별 · 문장 · 목록.
//
// 단어와 문장은 화면을 나눠 두되 탭은 하나로 둔다 — 둘 다 '외운다'는
// 같은 일이라 매번 최상단 탭을 오가게 할 이유가 없다. 대신 섞지는
// 않는다. 단어는 1초에 갈리고 문장은 읽어야 해서 리듬이 다르다.
//
// 복습은 스와이프 하나로 한다. 예전에는 버튼식 카드 화면이 아래에 같이
// 있었는데, 같은 카드를 두 방식으로 보여주는 것은 선택을 강요할 뿐
// 도움이 안 된다. 넘기는 방식은 하나면 된다.

const SUB = [
  { id: 'review', label: '복습' },
  { id: 'topic', label: '주제별' },
  { id: 'line', label: '문장' },
  { id: 'list', label: '목록' },
]

export default function VocabPart({ cards, reviewCards, settings, commit }) {
  const [sub, setSub] = useState('review')
  const [swiping, setSwiping] = useState(null)

  const hideBasic = settings.hideBasicWords !== false

  // 단어 파트에는 단어만 둔다. 구문·문장 하이라이트는 앞면이 한 문단인
  // 것도 있어서 스와이프로 넘길 물건이 아니다 — 여기서 통째로 뺀다.
  // 기초 단어(have, been)도 가린다. 둘 다 지우는 게 아니라 가리는 것이라
  // 데이터는 그대로 있고 설정에서 되돌릴 수 있다.
  const studyCards = useMemo(
    () => filterByLevel(cards, { hideBasic, wordsOnly: true }),
    [cards, hideBasic]
  )
  const studyReviewCards = useMemo(
    () => filterByLevel(reviewCards, { hideBasic, wordsOnly: true }),
    [reviewCards, hideBasic]
  )

  const dueCards = useMemo(
    () => selectDueCards(studyReviewCards, { limit: settings.dailyLimit }),
    [studyReviewCards, settings.dailyLimit]
  )
  const stats = useMemo(() => deckStats(studyReviewCards), [studyReviewCards])

  // 담은 문장 중 오늘 볼 것. 문장 칸에 숫자를 띄우기 위해서만 쓴다.
  const lineDue = useMemo(
    () =>
      selectDueCards(
        reviewCards.filter((c) => c.type === 'line'),
        { limit: settings.dailyLimit }
      ).length,
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
            {s.id === 'line' && lineDue > 0 && (
              <span className="tab__count">{lineDue}</span>
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

      {sub === 'line' && (
        <LinePart
          cards={cards}
          reviewCards={reviewCards}
          settings={settings}
          commit={commit}
        />
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
          예정된 복습을 다 끝냈습니다. 더 하고 싶으면 주제를 골라 넘겨
          보세요 — 복습 예정일과 상관없이 그 주제 전체가 나옵니다.
        </p>
        <button className="btn btn--primary" onClick={onGoTopic}>
          주제 고르기
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
 * 주제별 선택.
 *
 * B2 단어장 899개는 30주제 × 30단어로 나뉘어 있다. 시트에 Topic_ID
 * 숫자만 있어서 이름을 붙였다(lib/topics.js). 작품에서 나온 카드는
 * 작품별로 묶는다.
 */
function TopicPicker({ cards, onStart }) {
  // 스와이프에서 왼쪽(모름)으로 넘긴 카드는 lapseCount가 쌓인다.
  // "모르는 것만 다시 보고 싶다"는 건 세션 안에서만이 아니라 며칠 뒤에도
  // 필요한 일이라, 따로 모아 둔다. 자주 틀린 것이 위로 온다.
  const unknown = useMemo(
    () =>
      cards
        .filter((c) => (c.lapseCount ?? 0) > 0)
        .sort((a, b) => b.lapseCount - a.lapseCount || a.box - b.box),
    [cards]
  )

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

      {unknown.length > 0 && (
        <section className="stack">
          <div className="section-title">모름으로 넘긴 단어</div>
          <div
            className="panel"
            style={{
              padding: 'var(--s3) var(--s4)',
              borderColor: 'var(--accent-border)',
              background: 'var(--accent-soft)',
            }}
          >
            <div className="row row--between">
              <span className="list__main">
                <span className="list__title">← 로 넘긴 것 모아 보기</span>
                <span className="list__meta">
                  {unknown.length}개 · 두 번 이상 틀린 것{' '}
                  {unknown.filter((c) => c.lapseCount >= 2).length}개
                </span>
              </span>
              <button className="btn btn--sm" onClick={() => onStart(unknown)}>
                넘기기
              </button>
            </div>
          </div>
        </section>
      )}

      {groups.works.length > 0 && (
        <section className="stack">
          <div className="section-title">작품에서 나온 표현</div>
          {groups.works.map((g) => (
            <GroupRow key={g.name} icon="◆" name={g.name} cards={g.cards} onStart={onStart} />
          ))}
        </section>
      )}

      <section className="stack">
        <div className="section-title">주제별 어휘</div>
        {groups.topics.map((g) => (
          <GroupRow key={g.id} icon={g.icon} name={g.name} cards={g.cards} onStart={onStart} />
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
