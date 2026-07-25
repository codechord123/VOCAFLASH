import { useEffect, useMemo, useState } from 'react'
import { store } from './lib/store.js'
import { deckStats, selectDueCards } from './lib/srs.js'
import {
  cardsFromExpressions,
  cardsFromVocabNotes,
  cardsFromB2Words,
} from './lib/deck.js'

import scriptData from './data/before-sunrise.json'
import sentenceData from './data/sentences.json'
import expressionData from './data/expressions.json'
import meaningData from './data/meanings.json'
import b2Words from './data/b2-words.json'

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

  const sentenceById = useMemo(
    () => new Map(sentenceData.sentences.map((s) => [s.id, s])),
    []
  )

  // 첫 실행: 본인 자산을 덱에 심는다. 빈 화면으로 시작하지 않는 것이
  // 이 앱의 핵심이라 여기서 실패하면 안 된다.
  useEffect(() => {
    if (store.hasSeed(SEED_ID)) return
    const seeded = [
      ...cardsFromExpressions(expressionData.expressions, meanings),
      ...cardsFromVocabNotes(
        sentenceData.vocabNotes,
        sentenceData.chatVocab,
        sentenceById
      ),
      ...cardsFromB2Words(b2Words),
    ]
    const next = store.update((s) => ({ ...s, cards: seeded }))
    store.markSeed(SEED_ID, seeded.length)
    setState({ ...next })
  }, [meanings, sentenceById])

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
          {tab === 'read' && (
            <Read chapters={scriptData.chapters} cards={cards} />
          )}
          {tab === 'vocab' && <Vocab cards={cards} commit={commit} />}
          {tab === 'drill' && (
            <Drill sentences={sentenceData.sentences} works={sentenceData.works} />
          )}
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
