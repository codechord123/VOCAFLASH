import { useMemo, useState } from 'react'
import { COLOR_LABELS } from '../lib/deck.js'
import { isBasicWord } from '../lib/level.js'
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

export default function Read({ chapters, analysis: analysisData, cards, initialChapter = null }) {
  // 문법 색인에서 '8장' 칩을 누르면 그 챕터가 바로 열린다.
  const [selected, setSelected] = useState(initialChapter)
  const [section, setSection] = useState('script')

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
          c.kind !== 'sentence' &&
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

  if (selected == null) {
    return (
      <ChapterList
        chapters={chapters}
        analysisByChapter={analysisByChapter}
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

      <nav className="tabs" role="tablist" aria-label="챕터 내 화면">
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
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          )
        })}
      </nav>

      {section === 'script' && (
        <Script chapter={chapter} cardedTexts={cardedTexts} />
      )}
      {section === 'vocab' && <VocabSection items={chapterVocab} />}
      {section !== 'script' && section !== 'vocab' &&
        (analysis ? (
          <AnalysisSection section={section} analysis={analysis} />
        ) : (
          <NotGenerated />
        ))}

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

function ChapterList({ chapters, analysisByChapter, onSelect }) {
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

function Script({ chapter, cardedTexts }) {
  // 같은 대사가 두 번 나오는 챕터가 있다(본인이 만든 청크 학습본).
  // 원문을 먼저 보여주고 학습본은 아래에 따로 묶는다.
  const main = chapter.lines.filter((l) => !l.studyCopy)
  const studyCopy = chapter.lines.filter((l) => l.studyCopy)

  return (
    <div className="stack stack--loose">
      <div className="panel">
        <div className="stack">
          {main.map((line, i) => (
            <Line key={i} line={line} highlights={chapter.highlights} cardedTexts={cardedTexts} />
          ))}
        </div>
      </div>

      {studyCopy.length > 0 && (
        <div className="stack">
          <div className="section-title">본인이 만든 청크 학습본</div>
          <div className="panel">
            <div className="stack">
              {studyCopy.map((line, i) => (
                <Line key={i} line={line} highlights={chapter.highlights} cardedTexts={cardedTexts} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Line({ line, highlights, cardedTexts }) {
  if (line.type === 'direction' || line.type === 'note') {
    return <p className="direction">{line.text}</p>
  }

  return (
    <div>
      {line.speaker && <div className="speaker">{line.speaker}</div>}
      {/* 지시문은 대사와 같은 줄에 두지 않는다. 이어붙이면
          "(Still looking in Celine's direction) Do you have any idea…"처럼
          이탤릭과 본문이 한 문장으로 읽혀서 대사 시작점을 못 찾는다. */}
      {line.direction && (
        <div className="direction" style={{ marginBottom: 'var(--s1)' }}>
          ({line.direction})
        </div>
      )}
      <p className="read" style={{ margin: 0 }}>
        <Marked text={line.text} highlights={highlights} cardedTexts={cardedTexts} />
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
