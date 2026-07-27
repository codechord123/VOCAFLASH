import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
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

/**
 * 새 배포 뒤 옛 화면이 없는 파일을 부르는 문제.
 *
 * 자원 이름에는 내용 해시가 붙어서 배포할 때마다 바뀐다. 브라우저가 예전
 * index.html을 캐시에 들고 있으면 이미 사라진 이름을 부르게 되고, 화면은
 * "불러오지 못했습니다"로 멈춘다. 사용자 잘못이 아니라 배포의 문제이므로
 * 한 번은 조용히 새로고침해서 스스로 낫게 한다.
 *
 * 무한 새로고침을 막으려고 한 세션에 한 번만 시도한다 — 두 번째로 실패하면
 * 진짜 문제이니 오류 화면을 보여주는 편이 낫다.
 */
const RELOAD_FLAG = 'script-study.chunk-reload'

function recoverFromStaleChunk(err) {
  const stale = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
  if (!stale.test(String(err?.message ?? err))) return false
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false
    sessionStorage.setItem(RELOAD_FLAG, '1')
  } catch {
    return false
  }
  window.location.reload()
  return true
}

import { dayPlan, itemDone } from './lib/plan.js'
import VocabPart from './views/VocabPart.jsx'
import TodayPart from './views/TodayPart.jsx'
// 읽기와 구문독해는 탭을 눌렀을 때 받는다.
//
// 커리큘럼 자료(유닛·어휘·퀴즈·SRS) 520KB와 유닛 어휘 224KB가 첫
// 화면에 통째로 실려 있었다. 단어 탭만 보려고 앱을 열어도 다 받고
// 나서야 첫 글자가 나온다 — 지하철에서 신호가 약할 때 그게 그대로
// 기다림이 된다. 지금은 그 탭을 누른 사람만 받는다.
const ReadPart = lazy(() => import('./views/ReadPart.jsx'))
const Curriculum = lazy(() => import('./views/Curriculum.jsx'))
const GrammarPart = lazy(() => import('./views/GrammarPart.jsx'))
import Settings from './views/Settings.jsx'

// 학습 파트 3개. 라벨은 두 글자로 맞춘다 — 모바일 폭에서 긴 라벨이
// 있으면 탭이 잘린다. 설정은 파트가 아니므로 헤더 톱니로 뺐다.
// 담은 문장은 단어 파트 안의 한 칸이다.
// '오늘'이 첫 탭이자 기본이다 — 열자마자 무엇을 할지 정해져 있어야
// 고르는 데 힘을 안 쓴다.
const TABS = [
  { id: 'today', label: '오늘' },
  { id: 'vocab', label: '단어' },
  { id: 'read', label: '읽기' },
  { id: 'syntax', label: '구문' },
  { id: 'grammar', label: '문법' },
]

export default function App() {
  const [tab, setTab] = useState('today')
  // 오늘 화면에서 회독으로 보낼 때 열어 줄 챕터
  const [readTarget, setReadTarget] = useState(null)
  // 오늘 화면에서 과업으로 보낼 때 열어 줄 유닛
  const [unitTarget, setUnitTarget] = useState(null)
  // 안내 중인 오늘 항목. 다른 탭 아래에 '오늘로 돌아가기' 바가 따라간다.
  const [guide, setGuide] = useState(null) // { itemId }
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
      .catch((err) => {
        if (recoverFromStaleChunk(err)) return
        console.error('B2 단어장을 불러오지 못했습니다', err)
      })
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
      // 배포가 바뀌어 자원 이름이 어긋난 것이면 한 번 새로고침하면 낫는다
      if (recoverFromStaleChunk(err)) return null
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
  // 배지와 오늘 화면이 같은 카드 뭉치를 쓴다 — 숫자 따로 카드 따로면
  // 오늘 화면에서 '20개'를 보고 눌렀는데 18장이 나오는 일이 생긴다.
  const dueStudyCards = useMemo(
    () =>
      selectDueCards(
        filterByLevel(reviewCards, {
          hideBasic: state.settings.hideBasicWords !== false,
          wordsOnly: true,
        }),
        { limit: state.settings.dailyLimit }
      ),
    [reviewCards, state.settings.dailyLimit, state.settings.hideBasicWords]
  )
  const dueCount = dueStudyCards.length

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
            <span className="brand__name">Script Study</span>
            <span className="brand__sub">Before 시리즈 · Disenchantment</span>
          </div>
          <nav className="tabs" role="tablist" aria-label="화면 전환">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className="tab"
                onClick={() => {
                  if (t.id !== 'read') setReadTarget(null)
                  if (t.id !== 'syntax' && t.id !== 'grammar') setUnitTarget(null)
                  setGuide(null) // 직접 움직이면 안내는 접는다
                  setTab(t.id)
                }}
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
            onClick={() => {
              setShowSettings((v) => !v)
              window.scrollTo({ top: 0 })
            }}
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
          <BackupNotice
            state={state}
            onOpenSettings={() => {
              setShowSettings(true)
              window.scrollTo({ top: 0 })
            }}
          />

          {/* 설정은 본문 아래에 덧붙이지 않고 본문 대신 뜬다. 예전에는
              아래에 붙어서, 유닛처럼 긴 화면에서 내보내기를 누르면 화면
              밖에서 열렸다 — 눌러도 아무 일도 안 일어난 것처럼 보였다. */}
          {showSettings ? (
            <Settings
              cards={cards}
              settings={state.settings}
              stats={stats}
              commit={commit}
              onReload={() => setState({ ...store.load() })}
              onClose={() => setShowSettings(false)}
            />
          ) : (
          <>
          {tab === 'today' && (
            <TodayPart
              state={state}
              dueCards={dueStudyCards}
              settings={state.settings}
              commit={commit}
              onGuide={(item, today) => {
                // 그날의 유닛·챕터를 열어 준 채 보낸다. 목록에서 다시
                // 찾게 하면 안내가 아니다.
                if (item.tab === 'syntax' || item.tab === 'grammar') {
                  setUnitTarget(today.unit.id)
                }
                if (item.tab === 'read') setReadTarget(item.chapter ?? today.chapter)
                setGuide({ itemId: item.id })
                setTab(item.tab)
                window.scrollTo({ top: 0 })
              }}
            />
          )}

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
              <Suspense fallback={<BulkLoading label="읽기 화면을 불러오는 중" />}>
              <ReadPart
                chapters={reading.chapters}
                analysis={reading.analysis}
                sheetWorks={reading.sheetWorks}
                sheetAnalysis={reading.sheetAnalysis}
                levels={reading.levels}
                dict={reading.dict}
                phrases={reading.phrases}
                reads={state.reads}
                quizLog={state.quizLog}
                cards={cards}
                commit={commit}
                initialChapter={readTarget}
              />
              </Suspense>
            ) : (
              <BulkLoading
                error={readingError}
                label="원문과 해설을 불러오는 중"
                onRetry={() => ensureReading().catch(() => {})}
              />
            ))}

          {tab === 'grammar' && (
            <Suspense fallback={<BulkLoading label="문법 자료를 불러오는 중" />}>
              <GrammarPart
                reads={state.reads}
                grammar={state.grammar}
                commit={commit}
                initialUnitId={unitTarget?.startsWith('g-') ? unitTarget : null}
              />
            </Suspense>
          )}

          {tab === 'syntax' && (
            <Suspense fallback={<BulkLoading label="구문독해 자료를 불러오는 중" />}>
              <Curriculum
                cards={cards}
                commit={commit}
                curriculum={state.curriculum}
                reads={state.reads}
                initialUnitId={unitTarget?.startsWith('u-') ? unitTarget : null}
              />
            </Suspense>
          )}

          </>
          )}
        </div>
      </main>

      {guide && tab !== 'today' && (
        <GuideBar
          state={state}
          dueCount={dueCount}
          itemId={guide.itemId}
          onBack={() => {
            setGuide(null)
            setReadTarget(null)
            setUnitTarget(null)
            setTab('today')
            window.scrollTo({ top: 0 })
          }}
          onDismiss={() => setGuide(null)}
        />
      )}
    </div>
  )
}

/**
 * 안내 바. 오늘 화면에서 보낸 자리를 따라다니며 "몇 번째 일인지"와
 * 돌아갈 길을 붙잡아 둔다. 앱이 완료를 알아채면 버튼이 진해진다 —
 * 끝났는데도 돌아갈 길을 못 찾는 것이 따라 하기의 가장 흔한 이탈이다.
 */
function GuideBar({ state, dueCount, itemId, onBack, onDismiss }) {
  const today = dayPlan(state.plan?.day ?? 1)
  const item = today.items.find((i) => i.id === itemId)
  if (!item) return null
  const ctx = {
    dueCount,
    reads: state.reads,
    quizLog: state.quizLog,
    curriculum: state.curriculum,
    grammar: state.grammar,
    unit: today.unit,
    chapter: today.chapter,
  }
  const done = itemDone(item, state.plan, ctx)
  const stepNo = today.items.findIndex((i) => i.id === itemId) + 1

  return (
    <div className="guide-bar">
      <span className="guide-bar__text">
        오늘 {stepNo}/3 · {item.label}
      </span>
      <button className={`btn btn--sm${done ? ' btn--primary' : ''}`} onClick={onBack}>
        {done ? '끝 — 오늘로 ✓' : '오늘로'}
      </button>
      <button className="btn btn--ghost btn--sm" onClick={onDismiss} aria-label="안내 접기">
        ✕
      </button>
    </div>
  )
}

/**
 * 백업이 오래됐다고 알리는 한 줄.
 *
 * 저장은 브라우저 안에만 있다. 사파리는 한동안 안 쓴 사이트의 저장
 * 공간을 조용히 비우기도 하고, 방문 기록을 지우면 같이 날아간다.
 * 내보내기가 유일한 대비책인데, 눌러야 한다는 걸 잊으면 없는 것과 같다.
 *
 * 잃을 것이 있을 때만 뜨고, 이번 실행에서 닫으면 다시 안 뜬다 — 매번
 * 같은 자리에 있는 경고는 며칠 만에 배경이 된다.
 */
const BACKUP_STALE_DAYS = 14

function BackupNotice({ state, onOpenSettings }) {
  const [hidden, setHidden] = useState(
    () => sessionStorage.getItem('backup-notice-hidden') === '1'
  )
  if (hidden) return null

  const madeCards = state.cards?.length ?? 0
  const graded = Object.keys(state.progress ?? {}).length
  const read = Object.keys(state.reads ?? {}).length
  if (madeCards + graded + read === 0) return null // 아직 잃을 것이 없다

  const last = state.lastBackupAt ?? null
  const days = last == null ? null : Math.floor((Date.now() - last) / 86400000)
  if (days != null && days < BACKUP_STALE_DAYS) return null

  return (
    <div
      className="panel row row--between"
      style={{
        marginBottom: 'var(--s4)',
        borderColor: 'var(--accent-border)',
        background: 'var(--accent-soft)',
        gap: 'var(--s3)',
      }}
    >
      <span className="list__main">
        <span className="list__title">
          {last == null ? '아직 백업한 적이 없습니다' : `백업이 ${days}일 지났습니다`}
        </span>
        <span className="list__meta">
          진도는 이 브라우저 안에만 있습니다. 기록을 지우면 함께 사라집니다.
        </span>
      </span>
      <div className="row" style={{ gap: 'var(--s2)' }}>
        <button className="btn btn--sm" onClick={onOpenSettings}>
          내보내기
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => {
            sessionStorage.setItem('backup-notice-hidden', '1')
            setHidden(true)
          }}
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
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
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn btn--primary" onClick={onRetry}>
            다시 시도
          </button>
          <button className="btn" onClick={() => window.location.reload()}>
            새로고침
          </button>
        </div>
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
