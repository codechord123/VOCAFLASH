import { useCallback, useEffect, useMemo, useState } from 'react'
import { store } from './lib/store.js'
import { deckStats, selectDueCards } from './lib/srs.js'
import {
  cardsFromExpressions,
  cardsFromVocabNotes,
  cardsFromB2Words,
} from './lib/deck.js'

// 앱을 켜자마자 필요한 것만 정적으로 싣는다. 매일 여는 화면은
// '오늘'이고, 거기에 필요한 건 카드(localStorage)와 뜻풀이뿐이다.
import expressionData from './data/expressions.json'
import meaningData from './data/meanings.json'

// 원문 24챕터와 챕터 해설은 읽기 탭에서만 쓴다.
const loadReadingData = () =>
  Promise.all([
    import('./data/before-sunrise.json'),
    import('./data/analysis.json'),
  ]).then(([s, a]) => ({ chapters: s.default.chapters, analysis: a.default }))

// 문장 1,948개와 B2 단어 899개는 합쳐서 2MB에 가깝다. 첫 실행의 시드
// 생성과 문장 연습 탭에서만 쓰이므로 필요할 때 가져온다. 매일 여는
// 복습 화면이 이 무게를 지고 갈 이유가 없다.
const loadBulkData = () =>
  Promise.all([
    import('./data/sentences.json'),
    import('./data/b2-words.json'),
  ]).then(([s, b]) => ({ sentences: s.default, b2Words: b.default }))

import Today from './views/Today.jsx'
import Read from './views/Read.jsx'
import Vocab from './views/Vocab.jsx'
import Drill from './views/Drill.jsx'
import Settings from './views/Settings.jsx'

const TABS = [
  { id: 'today', label: '오늘' },
  { id: 'read', label: '읽기' },
  { id: 'vocab', label: '단어장' },
  { id: 'drill', label: '문장 연습' },
  { id: 'settings', label: '설정' },
]

// 시드를 한 번만 넣기 위한 키. 시드 내용이 바뀌면 버전을 올린다.
const SEED_ID = 'before-sunrise+sheet-vocab+b2.v2'

export default function App() {
  const [tab, setTab] = useState('today')
  const [state, setState] = useState(() => store.load())
  const [bulk, setBulk] = useState(null)
  const [bulkError, setBulkError] = useState(null)
  const [reading, setReading] = useState(null)
  const [readingError, setReadingError] = useState(null)

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

  const ensureBulk = useCallback(async () => {
    if (bulk) return bulk
    try {
      const loaded = await loadBulkData()
      setBulk(loaded)
      setBulkError(null)
      return loaded
    } catch (err) {
      // 조용히 실패하면 문장 연습 탭이 영원히 빈 화면이 된다.
      setBulkError(err)
      throw err
    }
  }, [bulk])

  // 첫 실행: 본인 자산을 덱에 심는다. 빈 화면으로 시작하지 않는 것이
  // 이 앱의 핵심이라 여기서 실패하면 안 된다.
  useEffect(() => {
    if (store.hasSeed(SEED_ID)) return
    let cancelled = false
    ensureBulk()
      .then(({ sentences, b2Words }) => {
        if (cancelled) return
        const sentenceById = new Map(sentences.sentences.map((s) => [s.id, s]))
        const seeded = [
          ...cardsFromExpressions(expressionData.expressions, meanings),
          ...cardsFromVocabNotes(
            sentences.vocabNotes,
            sentences.chatVocab,
            sentenceById
          ),
          ...cardsFromB2Words(b2Words),
        ]
        const next = store.update((s) => ({ ...s, cards: seeded }))
        store.markSeed(SEED_ID, seeded.length)
        setState({ ...next })
      })
      .catch(() => {
        /* 화면에 이미 오류를 띄운다 */
      })
    return () => {
      cancelled = true
    }
  }, [ensureBulk, meanings])

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

  // 탭을 열면 그때 가져온다.
  useEffect(() => {
    if (tab === 'drill' && !bulk) ensureBulk().catch(() => {})
    if (tab === 'read' && !reading) ensureReading().catch(() => {})
  }, [tab, bulk, reading, ensureBulk, ensureReading])

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
            <span className="brand__sub">Before 3부작 · Disenchantment</span>
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
                {t.id === 'today' && dueCount > 0 && (
                  <span className="tab__badge">{dueCount}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main>
        <div className="container">
          {tab === 'today' && (
            <Today
              cards={reviewCards}
              stats={stats}
              settings={state.settings}
              commit={commit}
              onGoTo={setTab}
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
          {tab === 'vocab' && <Vocab cards={cards} commit={commit} />}
          {tab === 'drill' &&
            (bulk ? (
              <Drill
                sentences={bulk.sentences.sentences}
                works={bulk.sentences.works}
              />
            ) : (
              <BulkLoading
                error={bulkError}
                onRetry={() => ensureBulk().catch(() => {})}
              />
            ))}
          {tab === 'settings' && (
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
