import { useCallback, useEffect, useMemo, useState } from 'react'
import { store } from './lib/store.js'
import { deckStats, selectDueCards } from './lib/srs.js'
import {
  cardsFromExpressions,
  cardsFromVocabNotes,
  cardsFromB2Words,
} from './lib/deck.js'

// 앱을 켜자마자 필요한 것만 정적으로 싣는다. 매일 여는 화면은
// 복습이고, 거기에 필요한 건 카드(localStorage)와 뜻풀이뿐이다.
import expressionData from './data/expressions.json'
import meaningData from './data/meanings.json'

// 원문과 챕터 해설(세 작품)은 읽기 탭에서만 쓴다.
const loadReadingData = () =>
  Promise.all([
    import('./data/before-sunrise.json'),
    import('./data/analysis.json'),
    import('./data/sheet-scripts.json'),
    import('./data/analysis-disenchantment.json'),
    import('./data/analysis-before-sunset.json'),
  ]).then(([s, a, sh, dis, bsu]) => ({
    chapters: s.default.chapters,
    analysis: a.default,
    sheetWorks: sh.default.works,
    // 작품 id -> 해설. 해설이 없는 챕터는 원문만 보인다.
    sheetAnalysis: {
      disenchantment: dis.default,
      'before-sunset': bsu.default,
    },
  }))

// 문장 1,948개와 B2 단어 899개는 무겁다. 첫 실행의 시드 생성에서만
// 쓰이므로 필요할 때 가져온다.
const loadBulkData = () =>
  Promise.all([
    import('./data/sentences.json'),
    import('./data/b2-words.json'),
  ]).then(([s, b]) => ({ sentences: s.default, b2Words: b.default }))

import VocabPart from './views/VocabPart.jsx'
import ReadPart from './views/ReadPart.jsx'
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
// v4: 시트 메모·B2 단어장 카드 복원. 이미 있는 카드(id 기준)는 진행을
// 유지하고 없는 것만 추가한다.
const SEED_ID = 'before-sunrise+sheet-vocab+b2.v4'

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

  // 첫 실행(또는 시드 버전 변경): 본인 자산을 덱에 심는다. 이미 있는
  // 카드는 id 기준으로 건드리지 않는다 — 복습 진행(박스·예정일)과
  // 유닛 카드, 읽다가 저장한 카드가 전부 그대로 남는다.
  useEffect(() => {
    if (store.hasSeed(SEED_ID)) return
    let cancelled = false
    loadBulkData()
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
        const next = store.update((s) => {
          const existing = new Set(s.cards.map((c) => c.id))
          return {
            ...s,
            cards: [...s.cards, ...seeded.filter((c) => !existing.has(c.id))],
          }
        })
        store.markSeed(SEED_ID, next.cards.length)
        setState({ ...next })
      })
      .catch((err) => console.error('시드 생성 실패', err))
    return () => {
      cancelled = true
    }
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
            <span className="brand__sub">Before 시리즈 · Disenchantment</span>
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
              <ReadPart
                chapters={reading.chapters}
                analysis={reading.analysis}
                sheetWorks={reading.sheetWorks}
                sheetAnalysis={reading.sheetAnalysis}
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
