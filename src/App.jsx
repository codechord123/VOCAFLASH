import { useCallback, useEffect, useMemo, useState } from 'react'
import { store } from './lib/store.js'
import { deckStats, selectDueCards, withProgress } from './lib/srs.js'
import { filterByLevel } from './lib/level.js'
import {
  cardsFromExpressions,
  cardsFromVocabNotes,
  cardsFromB2Words,
  cardsFromWordCards,
} from './lib/deck.js'

// 고정 자료는 앱에 들어 있다. 저장본에는 진행만 두고, 카드는 켤 때마다
// 여기서 다시 만든다 — 자료를 손봐도 복습 기록이 흔들리지 않는다.
import expressionData from './data/expressions.json'
import meaningData from './data/meanings.json'
import wordCardData from './data/word-cards.json'
import vocabNoteData from './data/vocab-notes.json'

// 원문과 챕터 해설(세 작품)은 읽기 탭에서만 쓴다.
const loadReadingData = () =>
  Promise.all([
    import('./data/before-sunrise.json'),
    import('./data/analysis.json'),
    import('./data/sheet-scripts.json'),
    import('./data/analysis-disenchantment.json'),
    import('./data/analysis-before-sunset.json'),
    import('./data/word-levels.json'),
    import('./data/word-dict.json'),
    import('./data/word-phrases.json'),
  ]).then(([s, a, sh, dis, bsu, lv, wd, ph]) => ({
    chapters: s.default.chapters,
    analysis: a.default,
    sheetWorks: sh.default.works,
    // 작품 id -> 해설. 해설이 없는 챕터는 원문만 보인다.
    sheetAnalysis: {
      disenchantment: dis.default,
      'before-sunset': bsu.default,
    },
    // 단어 레이어: 등급 3,147개(색)와 사전 806개(팝업)
    levels: lv.default.levels,
    dict: wd.default.words,
    phrases: ph.default.phrases,
  }))

// B2 단어장 899개는 300KB쯤 된다. 기본으로 꺼져 있는 덱이라 첫 화면을
// 막을 이유가 없어서 뒤늦게 싣는다.
const loadB2 = () => import('./data/b2-words.json').then((m) => m.default)

import VocabPart from './views/VocabPart.jsx'
import ReadPart from './views/ReadPart.jsx'
import Curriculum from './views/Curriculum.jsx'
import Settings from './views/Settings.jsx'

// 학습 파트 3개. 라벨은 두 글자로 맞춘다 — 모바일 폭에서 긴 라벨이
// 있으면 탭이 잘린다. 설정은 파트가 아니므로 헤더 톱니로 뺐다.
// 담은 문장은 단어 파트 안의 한 칸이다.
const TABS = [
  { id: 'vocab', label: '단어' },
  { id: 'read', label: '읽기' },
  { id: 'syntax', label: '구문' },
]

export default function App() {
  const [tab, setTab] = useState('vocab')
  const [state, setState] = useState(() => store.load())
  const [b2Words, setB2Words] = useState(null)
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

  // B2 단어장은 뒤늦게. 실패해도 나머지 학습은 그대로 돌아간다.
  useEffect(() => {
    let cancelled = false
    loadB2()
      .then((w) => !cancelled && setB2Words(w))
      .catch((err) => console.error('B2 단어장을 불러오지 못했습니다', err))
    return () => {
      cancelled = true
    }
  }, [])

  // 고정 자료로 만든 카드. 저장본에 넣지 않으므로 자료를 손봐도
  // 진행에 영향이 없다.
  const staticCards = useMemo(
    () => [
      ...cardsFromExpressions(expressionData.expressions, meanings),
      ...cardsFromWordCards(wordCardData.words),
      ...cardsFromVocabNotes(vocabNoteData.notes),
      ...(b2Words ? cardsFromB2Words(b2Words) : []),
    ],
    [meanings, b2Words]
  )

  // 화면이 쓰는 카드 = 고정 자료 + 사용자가 만든 것, 각각에 진행을 입힌 것.
  const cards = useMemo(() => {
    const progress = state.progress ?? {}
    const seen = new Set()
    const out = []
    for (const c of [...staticCards, ...state.cards]) {
      if (seen.has(c.id)) continue // 사용자 카드가 고정 자료와 겹칠 때
      seen.add(c.id)
      out.push(withProgress(c, progress[c.id]))
    }
    return out
  }, [staticCards, state.cards, state.progress])

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

  const activeDecks = state.settings.activeDecks ?? {}

  // 복습 큐는 켜진 덱만. 단어장 탭은 꺼진 덱까지 전부 보여준다 —
  // 꺼둔 것도 검색은 되어야 한다.
  const reviewCards = useMemo(
    () => cards.filter((c) => activeDecks[c.deck ?? 'highlight'] !== false),
    [cards, activeDecks]
  )

  const stats = useMemo(() => deckStats(reviewCards), [reviewCards])
  // 탭 배지는 단어 파트에서 실제로 넘길 카드 수와 같아야 한다. 단어
  // 파트가 구문·기초 단어를 걸러내므로 배지도 같은 기준으로 센다 —
  // 20이라 해놓고 열면 12장이 나오면 셈을 못 믿게 된다.
  const dueCount = useMemo(
    () =>
      selectDueCards(
        filterByLevel(reviewCards, {
          hideBasic: state.settings.hideBasicWords !== false,
          wordsOnly: true,
        }),
        { limit: state.settings.dailyLimit }
      ).length,
    [reviewCards, state.settings.dailyLimit, state.settings.hideBasicWords]
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
                levels={reading.levels}
                dict={reading.dict}
                phrases={reading.phrases}
                reads={state.reads}
                cards={cards}
                commit={commit}
              />
            ) : (
              <BulkLoading
                error={readingError}
                label="원문과 해설을 불러오는 중"
                onRetry={() => ensureReading().catch(() => {})}
              />
            ))}

          {tab === 'syntax' && (
            <Curriculum
              cards={cards}
              commit={commit}
              curriculum={state.curriculum}
            />
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
