import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { COLOR_LABELS } from '../lib/deck.js'
import { isBasicWord, isSingleWord } from '../lib/level.js'
import { cardFromLine, cardFromSelection, findChunkKo, lineId } from '../lib/lines.js'
import { READ_GOAL, lastReadLabel, markRead, readOf, undoRead } from '../lib/reads.js'
import { useWordLayer } from '../lib/useWordLayer.js'
import { WordText } from './WordText.jsx'
import WordPopup from './WordPopup.jsx'
import SelectionSave, { useTextSelection } from './SelectionSave.jsx'
import ChapterNav from './ChapterNav.jsx'
import unitVocabData from '../data/curriculum/unit-vocab.json'

// 읽기 화면. 원문 + 본인 하이라이트 + 구문 정리를 한 화면에 둔다.
//
// 구문 정리를 별도 탭으로 빼지 않은 이유: 청크 분석은 원문과 나란히
// 봐야 의미가 있다. 떼어놓으면 대조를 못 해서 죽은 자료가 된다.
//
// '단어'는 읽기 전 준비 운동이다 — 이 챕터에서 나올 단어를 먼저 훑고
// 원문으로 들어간다. 이해도 확인은 커리큘럼 퀴즈로 옮겨 가면서 뺐다.

export const SECTIONS = [
  { id: 'script', label: '원문' },
  { id: 'vocab', label: '단어' },
  { id: 'chunks', label: '구문 정리' },
  { id: 'grammar', label: '문법' },
  { id: 'background', label: '배경지식' },
]

export default function Read({ chapters, analysis: analysisData, levels, dict, phrases, reads, cards, commit, initialChapter = null }) {
  // 문법 색인에서 '8장' 칩을 누르면 그 챕터가 바로 열린다.
  const [selected, setSelected] = useState(initialChapter)
  const [section, setSection] = useState('script')
  const navRef = useRef(null)
  const pendingScroll = useRef(false)

  /**
   * 탭을 누르면 그 탭 바로 아래에서 새 화면이 시작되게 한다.
   *
   * 탭이 따라다니게 되면서 원문 한참 아래에서도 누를 수 있게 됐는데,
   * 그때 스크롤 위치를 그대로 두면 짧은 화면(단어·배경지식)은 이미
   * 다 지나간 자리에서 열린다 — 눌렀는데 아무 일도 안 일어난 것처럼 보인다.
   */
  function openSection(id) {
    if (id !== section) pendingScroll.current = true
    setSection(id)
  }

  // 스크롤은 새 화면이 그려진 뒤에 해야 한다. 누르자마자 옮기면 그 다음
  // 렌더에서 브라우저의 스크롤 앵커링이 "위쪽 내용이 바뀌었네" 하고
  // 원래 자리로 되돌려 놓는다.
  useLayoutEffect(() => {
    if (!pendingScroll.current) return
    pendingScroll.current = false
    const nav = navRef.current
    const body = nav?.nextElementSibling
    if (!body) return
    // 기준은 탭이 아니라 바로 아래 본문이다. 붙어 있는 동안 탭 자신의
    // 좌표는 offsetTop까지 56으로 밀려 있어 원래 자리를 알 수 없다.
    const y = body.getBoundingClientRect().top + window.scrollY - 56 - nav.offsetHeight
    if (window.scrollY > y) window.scrollTo({ top: Math.max(0, y) })
  }, [section])

  const analysisByChapter = useMemo(() => {
    const map = new Map()
    for (const a of analysisData.chapters ?? []) map.set(a.number, a)
    return map
  }, [])

  // 카드가 된 표현을 표시해 주기 위한 집합. 원문에서 "이미 카드로
  // 만든 것"을 구분할 수 있어야 중복 추가를 피한다.
  const cardedTexts = useMemo(
    () => new Set(cards.filter((c) => c.type === 'expression').map((c) => c.front)),
    [cards]
  )

  // 이 챕터를 읽기 위한 단어: 본인이 그 챕터에서 하이라이트한 단어·표현
  // (문장 단위와 기초 단어는 제외) + 커리큘럼 유닛에 배정된 그 챕터 어휘.
  const chapterVocab = useMemo(() => {
    if (selected == null) return []
    const fromHighlights = cards
      .filter(
        (c) =>
          c.type === 'expression' &&
          (c.deck ?? 'highlight') === 'highlight' &&
          c.source?.chapter === selected &&
          isSingleWord(c) &&
          !isBasicWord(c)
      )
      .map((c) => ({
        term: c.front,
        meaningKo: c.back?.meaningKo ?? null,
        nuance: c.back?.nuance ?? '',
        context: c.context ?? null,
        origin: '하이라이트',
      }))
    const seen = new Set(fromHighlights.map((v) => v.term.toLowerCase()))
    const fromUnits = unitVocabData.words
      .filter((w) =>
        w.sources?.some(
          (s) => s.work === 'before-sunrise' && s.chapter === selected
        )
      )
      .filter((w) => !seen.has(w.lemma.toLowerCase()))
      .map((w) => ({
        term: w.lemma,
        meaningKo: w.meaningKo,
        nuance: w.nuance,
        context: w.sources[0]?.context ?? null,
        origin: `커리큘럼 ${w.level}`,
      }))
    return [...fromHighlights, ...fromUnits]
  }, [cards, selected])

  const wl = useWordLayer({ levels, dict, phrases, cards, commit })

  // 드래그해서 담기. 원문 영역 안에서 그은 것만 받는다.
  const scriptRef = useRef(null)
  const { sel, clear } = useTextSelection(scriptRef)

  // 즐겨찾기한 줄. id는 위치 기반이라 화면에서 바로 대조할 수 있다.
  const savedLines = useMemo(
    () => new Set(cards.filter((c) => c.type === 'line').map((c) => c.id)),
    [cards]
  )

  /**
   * 줄 담기/빼기. 이미 담은 줄을 다시 누르면 뺀다 — 잘못 담았을 때
   * 되돌릴 방법이 없으면 담기를 주저하게 된다.
   *
   * 비포 선라이즈는 번역이 없어서, 담을 때 그 챕터 구문 정리에서 같은
   * 문장을 찾아 번역을 함께 저장한다.
   */
  /** 그은 만큼만 담는다. 번역은 구문 정리에서 찾아지면 같이 넣는다. */
  function saveSelection(text) {
    const card = cardFromSelection({
      work: 'before-sunrise',
      workTitle: 'Before Sunrise',
      chapter: selected,
      text,
      ko: findChunkKo(analysis?.chunks, text),
      speaker: null,
    })
    commit((s) =>
      s.cards.some((c) => c.id === card.id)
        ? s
        : { ...s, cards: [...s.cards, card] }
    )
    clear()
  }

  function toggleLine(index, line) {
    const id = lineId('before-sunrise', selected, index)
    if (savedLines.has(id)) {
      commit((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== id) }))
      return
    }
    const card = cardFromLine({
      work: 'before-sunrise',
      workTitle: 'Before Sunrise',
      chapter: selected,
      chapterTitle: chapter?.title ?? null,
      index,
      en: line.text,
      ko: findChunkKo(analysis?.chunks, line.text),
      speaker: line.speaker,
    })
    commit((s) => ({ ...s, cards: [...s.cards, card] }))
  }

  if (selected == null) {
    return (
      <ChapterList
        chapters={chapters}
        analysisByChapter={analysisByChapter}
        reads={reads}
        onSelect={(n) => {
          setSelected(n)
          setSection('script')
        }}
      />
    )
  }

  const chapter = chapters.find((c) => c.number === selected)
  const analysis = analysisByChapter.get(selected) ?? null
  // 이동은 대사가 있는 챕터끼리만. 0장은 노션에서 빈 페이지라 건너뛴다.
  const readable = chapters.filter((c) => c.lines?.length > 0)

  return (
    <div className="stack stack--loose">
      <div className="row row--between">
        <button className="btn btn--ghost btn--sm" onClick={() => setSelected(null)}>
          ← 챕터 목록
        </button>
        <span className="chip">
          하이라이트 {chapter.highlights.length}개
        </span>
      </div>


      <div>
        <h2>{chapter.title}</h2>
        {chapter.locationNote && (
          <p className="hint" style={{ marginTop: 'var(--s2)' }}>
            {chapter.locationNote}
          </p>
        )}
      </div>

      <nav className="tabs tabs--sticky" ref={navRef} role="tablist" aria-label="챕터 내 화면">
        {SECTIONS.map((s) => {
          // 단어는 해설과 별개 자료라 해설이 없어도 열 수 있다.
          const missing =
            s.id !== 'script' && s.id !== 'vocab' && !analysis
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={section === s.id}
              className="tab"
              disabled={missing}
              title={missing ? '아직 생성되지 않았습니다' : undefined}
              onClick={() => openSection(s.id)}
            >
              {s.label}
            </button>
          )
        })}
      </nav>

      {section === 'script' && (
        <div ref={scriptRef}>
          <Script
            chapter={chapter}
            cardedTexts={cardedTexts}
            savedLines={savedLines}
            onToggleLine={toggleLine}
            wl={wl}
          />
        </div>
      )}
      {section === 'vocab' && <VocabSection items={chapterVocab} />}
      {section !== 'script' && section !== 'vocab' &&
        (analysis ? (
          <AnalysisSection section={section} analysis={analysis} />
        ) : (
          <NotGenerated />
        ))}

      <SelectionSave
        sel={sel}
        saved={
          sel
            ? cards.some(
                (c) => c.front?.trim().toLowerCase() === sel.text.trim().toLowerCase()
              )
            : false
        }
        onSave={saveSelection}
        onClose={clear}
      />

      {wl.selected && (
        <WordPopup
          word={wl.selected.word}
          context={wl.selected.context}
          levels={wl.levels}
          dict={wl.dict}
          entry={wl.selected.entry}
          isPhrase={wl.selected.isPhrase}
          status={wl.statusOf(wl.selected.key ?? wl.selected.word)}
          isSaved={wl.isSaved(wl.selected.key ?? wl.selected.word)}
          onSetStatus={(st) => wl.setStatus(wl.selected.key ?? wl.selected.word, st)}
          onSave={wl.save}
          onClose={wl.closeWord}
        />
      )}

      {/* 회독 표시는 본문 아래에 둔다 — 다 읽고 나서 누르는 것이라,
          위에 있으면 읽기도 전에 손이 간다. */}
      <ReadTracker
        read={readOf(reads, 'before-sunrise', selected)}
        onMark={() => commit((s) => markRead(s, 'before-sunrise', selected))}
        onUndo={() => commit((s) => undoRead(s, 'before-sunrise', selected))}
      />

      <ChapterNav
        chapters={readable}
        current={selected}
        onGo={(n) => {
          setSelected(n)
          // 다음 장으로 넘어갈 때 보던 섹션을 유지한다. 구문 정리를
          // 연속으로 보는 중이었다면 매번 원문으로 되돌리면 방해가 된다.
          window.scrollTo({ top: 0 })
        }}
        onList={() => {
          setSelected(null)
          window.scrollTo({ top: 0 })
        }}
      />
    </div>
  )
}

function ChapterList({ chapters, analysisByChapter, reads, onSelect }) {
  const withDialogue = chapters.filter((c) => c.lines.length > 0)
  const empty = chapters.filter((c) => c.lines.length === 0)

  return (
    <div className="stack stack--loose">
      <div>
        <h1>Before Sunrise</h1>
        <p className="hint" style={{ marginTop: 'var(--s2)' }}>
          노션에 정리해둔 {chapters.length}개 챕터. 하이라이트는 본인이 표시한
          모르는 표현입니다.
        </p>
      </div>

      <div className="panel panel--flush">
        <div className="list">
          {withDialogue.map((c) => (
            <button
              key={c.number}
              className="list__item"
              style={{ background: 'none', border: 0, borderBottom: '1px solid var(--border)', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', width: '100%' }}
              onClick={() => onSelect(c.number)}
            >
              <span className="chip chip--box">{c.number}</span>
              <span className="list__main">
                <span className="list__title">{stripNumber(c.title)}</span>
                <span className="list__meta">
                  {c.lines.length}줄 · 하이라이트 {c.highlights.length}개
                  {analysisByChapter.has(c.number) ? ' · 구문 정리 있음' : ''}
                </span>
                <ReadMeter read={readOf(reads, 'before-sunrise', c.number)} />
              </span>
              <span style={{ color: 'var(--text-faint)' }}>→</span>
            </button>
          ))}
        </div>
      </div>

      {empty.length > 0 && (
        <div className="stack stack--tight">
          <div className="section-title">내용이 비어 있는 챕터</div>
          <p className="hint">
            {empty.map((c) => stripNumber(c.title)).join(' · ')} — 노션 페이지가
            비어 있습니다.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * 챕터 목록의 회독 한 줄. 숫자만 있으면 스무 번이 멀어 보이므로 막대로
 * 같이 보여준다. 한 번도 안 읽은 챕터는 아무것도 그리지 않는다 —
 * 목록 전체가 빈 막대로 얼룩지면 어디까지 왔는지가 오히려 안 보인다.
 */
function ReadMeter({ read }) {
  if (!read.count) return null
  const label = lastReadLabel(read.lastAt)
  return (
    <span className="read-meter">
      <span className="read-meter__bar">
        <span
          className="read-meter__fill"
          style={{ width: `${Math.min(100, (read.count / READ_GOAL) * 100)}%` }}
        />
      </span>
      <span className="read-meter__text">
        {read.count}/{READ_GOAL}회독{label ? ` · ${label}` : ''}
      </span>
    </span>
  )
}

/** 챕터 안에서 회독을 세는 자리. 다 읽고 직접 누른 것만 센다. */
function ReadTracker({ read, onMark, onUndo }) {
  const label = lastReadLabel(read.lastAt)
  const done = read.count >= READ_GOAL

  return (
    <div
      className="panel"
      style={{
        padding: 'var(--s3) var(--s4)',
        borderColor: done ? 'var(--accent-border)' : undefined,
        background: done ? 'var(--accent-soft)' : undefined,
      }}
    >
      <div className="row row--between">
        <span className="list__main">
          <span className="list__title">
            {read.count}/{READ_GOAL}회독{done ? ' — 목표 달성' : ''}
          </span>
          <span className="list__meta">
            {label ? `마지막으로 읽은 날 · ${label}` : '아직 읽음 표시를 하지 않았습니다'}
          </span>
        </span>
        <div className="row" style={{ gap: 'var(--s1)' }}>
          {read.count > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={onUndo} title="잘못 눌렀을 때">
              −1
            </button>
          )}
          <button className="btn btn--sm" onClick={onMark}>
            읽음
          </button>
        </div>
      </div>
      <div className="progress" style={{ marginTop: 'var(--s2)' }}>
        <div
          className="progress__bar"
          style={{ width: `${Math.min(100, (read.count / READ_GOAL) * 100)}%` }}
        />
      </div>
    </div>
  )
}

function Script({ chapter, cardedTexts, savedLines, onToggleLine, wl }) {
  // 같은 대사가 두 번 나오는 챕터가 있다(본인이 만든 청크 학습본).
  // 원문을 먼저 보여주고 학습본은 아래에 따로 묶는다.
  //
  // 인덱스는 걸러내기 전 원본 위치를 쓴다 — 즐겨찾기 id가 위치 기반이라,
  // 걸러낸 뒤 번호를 다시 매기면 같은 줄이 다른 카드가 된다.
  const withIndex = chapter.lines.map((line, i) => ({ line, i }))
  const main = withIndex.filter(({ line }) => !line.studyCopy)
  const studyCopy = withIndex.filter(({ line }) => line.studyCopy)

  return (
    <div className="stack stack--loose">
      <div className="panel">
        <div className="stack">
          {main.map(({ line, i }) => (
            <Line
              key={i}
              line={line}
              highlights={chapter.highlights}
              cardedTexts={cardedTexts}
              saved={savedLines?.has(lineId('before-sunrise', chapter.number, i))}
              onToggle={onToggleLine ? () => onToggleLine(i, line) : null}
              wl={wl}
            />
          ))}
        </div>
      </div>

      {studyCopy.length > 0 && (
        <div className="stack">
          <div className="section-title">본인이 만든 청크 학습본</div>
          <div className="panel">
            <div className="stack">
              {studyCopy.map(({ line, i }) => (
                <Line key={i} line={line} highlights={chapter.highlights} cardedTexts={cardedTexts} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Line({ line, highlights, cardedTexts, saved = false, onToggle = null, wl = null }) {
  if (line.type === 'direction' || line.type === 'note') {
    return <p className="direction">{line.text}</p>
  }

  return (
    <div className="line">
      {(line.speaker || onToggle) && (
        <div className="row row--between">
          {line.speaker ? <div className="speaker">{line.speaker}</div> : <span />}
          {onToggle && <StarButton saved={saved} onClick={onToggle} />}
        </div>
      )}
      {/* 지시문은 대사와 같은 줄에 두지 않는다. 이어붙이면
          "(Still looking in Celine's direction) Do you have any idea…"처럼
          이탤릭과 본문이 한 문장으로 읽혀서 대사 시작점을 못 찾는다. */}
      {line.direction && (
        <div className="direction" style={{ marginBottom: 'var(--s1)' }}>
          ({line.direction})
        </div>
      )}
      <p className="read" style={{ margin: 0 }}>
        {wl ? (
          <WordText
            text={line.text}
            levels={wl.levels}
            dict={wl.dict}
            phrases={wl.phrases}
            statusMap={wl.statusMap}
            onWord={wl.openWord}
            onPhrase={wl.openPhrase}
          />
        ) : (
          <Marked text={line.text} highlights={highlights} cardedTexts={cardedTexts} />
        )}
      </p>
      {line.translation && <div className="ko">{line.translation}</div>}
    </div>
  )
}

/**
 * 줄 안에서 하이라이트된 부분을 표시한다.
 *
 * 겹치는 하이라이트는 긴 것을 우선한다 — 짧은 조각이 긴 문장 안에
 * 들어 있는 경우가 있어서 그냥 순서대로 자르면 마크업이 깨진다.
 */
function Marked({ text, highlights, cardedTexts }) {
  const spans = useMemo(() => {
    const found = []
    for (const h of highlights) {
      if (!h.text) continue
      const at = text.indexOf(h.text)
      if (at === -1) continue
      found.push({ start: at, end: at + h.text.length, h })
    }
    found.sort((a, b) => a.start - b.start || b.end - a.end)

    const kept = []
    let cursor = 0
    for (const s of found) {
      if (s.start < cursor) continue // 앞선 하이라이트와 겹침
      kept.push(s)
      cursor = s.end
    }
    return kept
  }, [text, highlights])

  if (!spans.length) return text

  const out = []
  let cursor = 0
  spans.forEach((s, i) => {
    if (s.start > cursor) out.push(text.slice(cursor, s.start))
    const carded = cardedTexts.has(s.h.text)
    out.push(
      <mark
        key={i}
        className="hl"
        title={`${COLOR_LABELS[s.h.color] ?? s.h.color}${carded ? ' · 카드에 있음' : ''}`}
      >
        {text.slice(s.start, s.end)}
      </mark>
    )
    cursor = s.end
  })
  if (cursor < text.length) out.push(text.slice(cursor))
  return out
}

/**
 * 줄 담기 버튼.
 *
 * 줄 전체를 누르게 하지 않은 이유: 읽는 중에 단어를 짚거나 문장을
 * 드래그하는 동작과 겹쳐서, 읽다 말고 자꾸 담기게 된다.
 */
function StarButton({ saved, onClick }) {
  return (
    <button
      className={`star${saved ? ' is-on' : ''}`}
      onClick={onClick}
      aria-pressed={saved}
      title={saved ? '즐겨찾기에서 빼기' : '이 문장 담기'}
    >
      {saved ? '★' : '☆'}
    </button>
  )
}

export function AnalysisSection({ section, analysis }) {
  if (section === 'chunks') {
    return (
      <div className="stack">
        {analysis.chunks.map((c, i) => (
          <div className="panel" key={i}>
            <div className="read" style={{ marginBottom: 'var(--s2)' }}>{c.en}</div>
            <div className="ko">{c.literal}</div>
            <div className="ko" style={{ color: 'var(--text)' }}>{c.ko}</div>
          </div>
        ))}
      </div>
    )
  }

  if (section === 'grammar') {
    return (
      <div className="stack">
        {analysis.grammar.map((g, i) => (
          <div className="panel stack stack--tight" key={i}>
            <h4>{g.point}</h4>
            <p>{g.explanation}</p>
            <div className="flashcard__context">{g.fromScript}</div>
            <p className="hint">예문 — {g.example}</p>
          </div>
        ))}
      </div>
    )
  }

  if (section === 'background') {
    return (
      <div className="stack">
        {analysis.background.map((b, i) => (
          <div className="panel stack stack--tight" key={i}>
            <h4>{b.topic}</h4>
            <p>{b.detail}</p>
          </div>
        ))}
      </div>
    )
  }

  return null
}

/**
 * 읽기 전 단어 훑기. 단어를 먼저 보고 뜻을 떠올린 다음 탭해서 확인한다 —
 * 뜻을 처음부터 펼쳐 두면 훑기만 하고 기억에 안 남는다.
 */
export function VocabSection({ items }) {
  const [shown, setShown] = useState(() => new Set())

  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">◇</div>
        <div className="empty__title">이 챕터의 단어 자료가 없습니다</div>
        <p className="empty__body">
          하이라이트한 단어나 커리큘럼 배정 어휘가 있는 챕터에서 단어
          훑기가 나타납니다.
        </p>
      </div>
    )
  }

  const allShown = shown.size >= items.length

  return (
    <div className="stack">
      <div className="row row--between">
        <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
          읽기 전에 훑는 단어 {items.length}개. 탭해서 뜻을 확인하세요.
        </p>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() =>
            setShown(allShown ? new Set() : new Set(items.map((_, i) => i)))
          }
        >
          {allShown ? '모두 가리기' : '모두 보기'}
        </button>
      </div>

      {items.map((v, i) => {
        const open = shown.has(i)
        return (
          <button
            key={i}
            className="panel"
            onClick={() =>
              setShown((s) => {
                const next = new Set(s)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                return next
              })
            }
            aria-expanded={open}
            style={{
              padding: 'var(--s3) var(--s4)',
              textAlign: 'left',
              cursor: 'pointer',
              font: 'inherit',
              color: 'inherit',
            }}
          >
            <div className="row row--between">
              <span className="read" style={{ fontSize: 16 }}>
                {v.term}
              </span>
              <span className="row" style={{ gap: 'var(--s2)' }}>
                <span className="chip" style={{ fontSize: 11 }}>
                  {v.origin}
                </span>
                <span style={{ color: 'var(--text-faint)' }}>
                  {open ? '−' : '+'}
                </span>
              </span>
            </div>
            {open && (
              <div className="stack stack--tight" style={{ marginTop: 'var(--s2)' }}>
                <div>{v.meaningKo ?? '뜻 미생성'}</div>
                {v.nuance && (
                  <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
                    {v.nuance}
                  </p>
                )}
                {v.context && (
                  <p className="flashcard__context" style={{ margin: 0 }}>
                    {v.context}
                  </p>
                )}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function NotGenerated() {
  return (
    <div className="empty">
      <div className="empty__icon">◇</div>
      <div className="empty__title">이 챕터는 아직 생성되지 않았습니다</div>
      <p className="empty__body">
        구문 정리·문법·배경지식은 미리 만들어 앱에 넣는 방식입니다. 새로
        만들려면 Claude Code에서 생성 작업을 다시 돌려 주세요.
      </p>
    </div>
  )
}

function stripNumber(title) {
  return title.replace(/^[⭐\s]*(chapter|chatper)\s*\d+\s*[:.]?\s*/i, '').trim() || title
}
