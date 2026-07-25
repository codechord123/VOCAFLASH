import { useCallback, useEffect, useMemo, useState } from 'react'
import { store } from './lib/store.js'
import { deckStats, selectDueCards } from './lib/srs.js'
import { cardsFromExpressions } from './lib/deck.js'

// 앱을 켜자마자 필요한 것만 정적으로 싣는다. 매일 여는 화면은
// 복습이고, 거기에 필요한 건 카드(localStorage)와 뜻풀이뿐이다.
import expressionData from './data/expressions.json'
import meaningData from './data/meanings.json'

// 원문 24챕터와 챕터 해설은 읽기 탭에서만 쓴다.
const loadReadingData = () =>
  Promise.all([
    import('./data/before-sunrise.json'),
    import('./data/analysis.json'),
  ]).then(([s, a]) => ({
    chapters: s.default.chapters,
    analysis: a.default,
  }))

import VocabPart from './views/VocabPart.jsx'
import Read from './views/Read.jsx'
import Curriculum from './views/Curriculum.jsx'
import Settings from './views/Settings.jsx'

// 학습 파트 3개. 5개 탭은 모바일에서 라벨이 잘려서 못 쓴다.
// 설정은 파트가 아니므로 헤더 톱니로 빼고, 문장 연습은 단어 파트가
// 아니라 구문독해 파트에 속한다 — 문장을 만드는 훈련이니까.
const TABS = [
  { id: 'vocab', label: '단어' },
  { id: 'read', label: '읽기' },
  { id: 'syntax', label: '구문독해' },
]

// 시드를 한 번만 넣기 위한 키. 시드 내용이 바뀌면 버전을 올린다.
// v3: 비포 선라이즈만 남긴다 — 시트 메모·B2 단어장 카드를 덱에서 뺀다.
const SEED_ID = 'before-sunrise-only.v3'

export default function App() {
  const [tab, setTab] = useState('vocab')
  const [state, setState] = useState(() => store.load())
  const [reading, setReading] = useState(null)
  const [readingError, setReadingError] = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  // 뜻풀이는 id 또는 표현 텍스트로 찾는다. 생성 산출물이 어느 쪽 키를
  // 쓰든 동작하게 두 방향 모두 색인한다.
  const meanings = useMemo(() => {
    const map = {}
    for (const m of meaningData.meanings ?? []) {
      if (m.expressionId) map[m.expressionId] = m
      if (m.term) map[m.term] = m
    }
    return map
  }, [])

  // 첫 실행(또는 시드 버전 변경): 비포 선라이즈 하이라이트만 덱에 심는다.
  // 이미 있던 카드의 복습 진행(박스·예정일)은 id가 같으면 그대로 살리고,
  // 삭제된 자료에서 온 카드(시트 메모·B2)만 걷어낸다. 사용자가 읽다가
  // 직접 저장한 카드는 어느 덱이든 남긴다.
  useEffect(() => {
    if (store.hasSeed(SEED_ID)) return
    const seeded = cardsFromExpressions(expressionData.expressions, meanings)
    const next = store.update((s) => {
      const kept = s.cards.filter(
        (c) => c.origin !== 'learner-note' && c.origin !== 'curated'
      )
      const keptIds = new Set(kept.map((c) => c.id))
      return { ...s, cards: [...kept, ...seeded.filter((c) => !keptIds.has(c.id))] }
    })
    store.markSeed(SEED_ID, next.cards.length)
    setState({ ...next })
  }, [meanings])

  const ensureReading = useCallback(async () => {
    if (reading) return reading
    try {
      const loaded = await loadReadingData()
      setReading(loaded)
      setReadingError(null)
      return loaded
    } catch (err) {
      setReadingError(err)
      throw err
    }
  }, [reading])

  // 탭을 열면 그때 가져온다. 구문독해(커리큘럼)는 자체 정적 데이터라
  // 따로 불러올 것이 없다.
  useEffect(() => {
    if (tab === 'read' && !reading) {
      ensureReading().catch(() => {})
    }
  }, [tab, reading, ensureReading])

  const cards = state.cards
  const activeDecks = state.settings.activeDecks ?? {}

  // 복습 큐는 켜진 덱만. 단어장 탭은 꺼진 덱까지 전부 보여준다 —
  // 꺼둔 것도 검색은 되어야 한다.
  const reviewCards = useMemo(
    () => cards.filter((c) => activeDecks[c.deck ?? 'highlight'] !== false),
    [cards, activeDecks]
  )

  const stats = useMemo(() => deckStats(reviewCards), [reviewCards])
  const dueCount = useMemo(
    () => selectDueCards(reviewCards, { limit: state.settings.dailyLimit }).length,
    [reviewCards, state.settings.dailyLimit]
  )

  /** 저장과 화면 상태를 함께 갱신한다. 한쪽만 바뀌면 새로고침에 사라진다. */
  function commit(mutator) {
    const next = store.update(mutator)
    setState({ ...next })
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar__inner">
          <div className="brand">
            <span className="brand__mark">◆</span>
            <span>Script Study</span>
            <span className="brand__sub">Before Sunrise</span>
          </div>
          <nav className="tabs" role="tablist" aria-label="화면 전환">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className="tab"
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === 'vocab' && dueCount > 0 && (
                  <span className="tab__badge">{dueCount}</span>
                )}
              </button>
            ))}
          </nav>
          <button
            className="tab tab--icon"
            onClick={() => setShowSettings((v) => !v)}
            aria-pressed={showSettings}
            aria-label="설정"
            title="설정"
          >
            ⚙
          </button>
        </div>
      </header>

      <main>
        <div className="container">
          {tab === 'vocab' && (
            <VocabPart
              cards={cards}
              reviewCards={reviewCards}
              settings={state.settings}
              commit={commit}
            />
          )}

          {tab === 'read' &&
            (reading ? (
              <Read
                chapters={reading.chapters}
                analysis={reading.analysis}
                cards={cards}
              />
            ) : (
              <BulkLoading
                error={readingError}
                label="원문과 해설을 불러오는 중"
                onRetry={() => ensureReading().catch(() => {})}
              />
            ))}

          {tab === 'syntax' && (
            <Curriculum commit={commit} curriculum={state.curriculum} />
          )}

          {showSettings && (
            <Settings
              cards={cards}
              settings={state.settings}
              stats={stats}
              commit={commit}
              onReload={() => setState({ ...store.load() })}
            />
          )}
        </div>
      </main>
    </div>
  )
}

function BulkLoading({ error, onRetry, label = '문장 데이터를 불러오는 중' }) {
  if (error) {
    return (
      <div className="empty">
        <div className="empty__icon">✕</div>
        <div className="empty__title">데이터를 불러오지 못했습니다</div>
        <p className="empty__body">네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p>
        <button className="btn btn--primary" onClick={onRetry}>
          다시 시도
        </button>
      </div>
    )
  }
  return (
    <div className="empty">
      <span className="spin" />
      <div className="empty__title">{label}</div>
      <p className="empty__body">처음 한 번만 내려받습니다.</p>
    </div>
  )
}
