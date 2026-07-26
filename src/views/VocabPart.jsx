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

  /**
   * 복습 화면의 숫자 묶음. 숫자만 보여주고 마는 것이 아니라, 눌러서
   * 그 묶음만 바로 넘길 수 있어야 한다 — "아직 안 본 807개"를 보고도
   * 거기로 갈 방법이 없으면 숫자가 벽이 된다.
   *
   * 어느 묶음이든 덜 외운 순서로 준다.
   */
  const piles = useMemo(() => {
    const order = (list) =>
      [...list].sort(
        (a, b) => a.box - b.box || a.dueAt - b.dueAt || b.lapseCount - a.lapseCount
      )
    return {
      due: dueCards,
      unlearned: order(
        studyReviewCards.filter((c) => (c.lapseCount ?? 0) > 0 && c.box === 1)
      ),
      fresh: order(studyReviewCards.filter((c) => c.reviewCount === 0)),
      learned: order(studyReviewCards.filter((c) => c.box === 5)),
      all: order(studyReviewCards),
    }
  }, [studyReviewCards, dueCards])

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
          piles={piles}
          stats={stats}
          onStart={(sel) => setSwiping(sel)}
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

function Review({ dueCards, piles, stats, onStart, onGoTopic }) {
  if (stats.total === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">◆</div>
        <div className="empty__title">카드가 없습니다</div>
        <p className="empty__body">설정에서 복습할 덱을 켜 주세요.</p>
      </div>
    )
  }

  // 눌러서 바로 넘길 수 있는 묶음들. 숫자가 곧 입구다.
  const tiles = [
    { key: 'due', value: dueCards.length, label: '오늘 볼 카드', cards: piles.due, accent: true },
    { key: 'unlearned', value: piles.unlearned.length, label: '아직 못 외운 것', cards: piles.unlearned },
    { key: 'fresh', value: piles.fresh.length, label: '아직 안 본 것', cards: piles.fresh },
    { key: 'learned', value: piles.learned.length, label: '익힘', cards: piles.learned },
    { key: 'all', value: stats.total, label: '전체', cards: piles.all },
  ]

  return (
    <div className="stack stack--loose">
      {dueCards.length > 0 ? (
        <button className="btn btn--primary btn--block" onClick={() => onStart(dueCards)}>
          스와이프로 {dueCards.length}개 넘기기
        </button>
      ) : (
        <div className="empty">
          <div className="empty__icon">✓</div>
          <div className="empty__title">오늘 볼 카드가 없습니다</div>
          <p className="empty__body">
            예정된 복습을 다 끝냈습니다. 아래 숫자를 눌러 그 묶음만 몰아서
            넘길 수 있습니다.
          </p>
          <button className="btn btn--primary" onClick={onGoTopic}>
            주제 고르기
          </button>
        </div>
      )}

      <div className="tiles">
        {tiles.map((t) => (
          <button
            key={t.key}
            className={`tile tile--action${t.accent ? ' tile--accent' : ''}`}
            disabled={t.cards.length === 0}
            onClick={() => onStart(t.cards)}
            title={t.cards.length > 0 ? `${t.label} ${t.value}개 넘기기` : '넘길 카드가 없습니다'}
          >
            <div className="tile__value">{t.value.toLocaleString('ko')}</div>
            <div className="tile__label">{t.label}</div>
          </button>
        ))}
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
  // 아직 못 외운 단어 = 모름으로 넘긴 뒤 아직 다시 맞히지 못한 것.
  //
  // lapseCount는 '틀린 적 있음'의 누적 기록이라 한번 쌓이면 줄지 않는다.
  // 그걸로 묶음을 만들면 이미 외운 단어까지 매번 같은 자리에서 다시
  // 나와서, 넘겨도 넘겨도 61개가 그대로다. 그래서 '지금 1번 상자에
  // 있으면서 틀린 적 있는 것'으로 잡는다 — 한 번 맞히면 상자가 올라가며
  // 이 묶음에서 빠지고, 나중에 또 잊으면 다시 들어온다.
  const everMissed = useMemo(
    () => cards.filter((c) => (c.lapseCount ?? 0) > 0),
    [cards]
  )
  const unknown = useMemo(
    () =>
      everMissed
        .filter((c) => c.box === 1)
        .sort((a, b) => b.lapseCount - a.lapseCount || a.dueAt - b.dueAt),
    [everMissed]
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

      {everMissed.length > 0 && (
        <section className="stack">
          <div className="section-title">아직 못 외운 단어</div>
          <div
            className="panel"
            style={{
              padding: 'var(--s3) var(--s4)',
              borderColor: unknown.length > 0 ? 'var(--accent-border)' : undefined,
              background: unknown.length > 0 ? 'var(--accent-soft)' : undefined,
            }}
          >
            <div className="row row--between">
              <span className="list__main">
                <span className="list__title">
                  ← 로 넘긴 뒤 아직 못 맞힌 것 {unknown.length}개
                </span>
                <span className="list__meta">
                  지금까지 모름으로 넘긴 단어 {everMissed.length}개 ·
                  맞히면 이 묶음에서 빠집니다
                </span>
              </span>
              <button
                className="btn btn--sm"
                disabled={unknown.length === 0}
                onClick={() => onStart(unknown)}
              >
                넘기기
              </button>
            </div>
            {/* 얼마나 줄었는지 보여야 다시 열 마음이 생긴다 */}
            <div className="progress" style={{ marginTop: 'var(--s2)' }}>
              <div
                className="progress__bar"
                style={{
                  width: `${((everMissed.length - unknown.length) / everMissed.length) * 100}%`,
                }}
              />
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

  /**
   * 넘길 순서.
   *
   * 예전에는 배열 순서 그대로 넘겨서, 이미 5번 상자까지 올린 단어가 매번
   * 1번 자리에 다시 나왔다 — "앎으로 표시했는데 또 처음부터 나온다"는 게
   * 이것이다. 다 외운 것은 빼고, 남은 것도 덜 외운 순서로 준다.
   */
  const toStudy = useMemo(() => {
    const rest = cards.filter((c) => c.box < 5)
    const pool = rest.length > 0 ? rest : cards // 다 외웠으면 전체를 다시
    return [...pool].sort(
      (a, b) => a.box - b.box || a.dueAt - b.dueAt || b.lapseCount - a.lapseCount
    )
  }, [cards])

  const allLearned = learned === cards.length

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
        <button className="btn btn--sm" onClick={() => onStart(toStudy)}>
          {allLearned ? `전체 ${cards.length}개` : `안 외운 ${toStudy.length}개`}
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
