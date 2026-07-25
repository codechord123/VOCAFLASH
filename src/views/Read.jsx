import { useMemo, useState } from 'react'
import { COLOR_LABELS } from '../lib/deck.js'

// 읽기 화면. 원문 + 본인 하이라이트 + 구문 정리를 한 화면에 둔다.
//
// 구문 정리를 별도 탭으로 빼지 않은 이유: 청크 분석은 원문과 나란히
// 봐야 의미가 있다. 떼어놓으면 대조를 못 해서 죽은 자료가 된다.

const SECTIONS = [
  { id: 'script', label: '원문' },
  { id: 'chunks', label: '구문 정리' },
  { id: 'grammar', label: '문법' },
  { id: 'background', label: '배경지식' },
  { id: 'quiz', label: '이해도 확인' },
]

export default function Read({ chapters, analysis: analysisData, cards }) {
  const [selected, setSelected] = useState(null)
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
          const missing = s.id !== 'script' && !analysis
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
      {section !== 'script' &&
        (analysis ? (
          <AnalysisSection section={section} analysis={analysis} />
        ) : (
          <NotGenerated />
        ))}
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
      {line.direction && <span className="direction">({line.direction}) </span>}
      <span className="read">
        <Marked text={line.text} highlights={highlights} cardedTexts={cardedTexts} />
      </span>
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

function AnalysisSection({ section, analysis }) {
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

  return <Quiz items={analysis.comprehension} />
}

function Quiz({ items }) {
  const [shown, setShown] = useState(() => new Set())

  return (
    <div className="stack">
      {items.map((q, i) => (
        <div className="panel stack stack--tight" key={i}>
          <p style={{ fontWeight: 540 }}>
            {i + 1}. {q.question}
          </p>
          {shown.has(i) ? (
            <p className="ko" style={{ color: 'var(--text)' }}>{q.answer}</p>
          ) : (
            <button
              className="btn btn--sm"
              style={{ justifySelf: 'start' }}
              onClick={() => setShown((s) => new Set(s).add(i))}
            >
              답 보기
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function NotGenerated() {
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
