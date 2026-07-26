import { useMemo, useState } from 'react'
import { SECTIONS, AnalysisSection, NotGenerated } from './Read.jsx'
import { cardFromLine, lineId } from '../lib/lines.js'
import { READ_GOAL, lastReadLabel, markRead, readOf, undoRead } from '../lib/reads.js'
import { useWordLayer } from '../lib/useWordLayer.js'
import { WordText } from './WordText.jsx'
import WordPopup from './WordPopup.jsx'
import ChapterNav from './ChapterNav.jsx'

// 시트에서 온 작품(Disenchantment, Before Sunset)의 읽기 화면.
//
// Before Sunrise와 같은 방식으로 읽는다 — 원문과 번역을 나란히 둔다.
// 이 두 편은 하이라이트도 챕터 해설도 없어서 섹션 탭이 없을 뿐이고,
// 읽는 경험 자체는 기존 리더와 같게 유지한다.
//
// 번역 가리기는 원하면 켜는 선택 기능으로만 둔다(기본 꺼짐).
//
// 해설이 생성된 챕터에는 Before Sunrise와 같은 섹션 탭이 붙는다.
// 아직 생성되지 않은 챕터는 '원문'만 보인다 — 탭을 띄워놓고 빈 화면을
// 보여주는 것보다 낫다.

export default function SheetRead({ work, analysis, levels, dict, phrases, reads, cards, commit, onBack }) {
  const [selected, setSelected] = useState(null)
  const [section, setSection] = useState('script')
  const [hideKo, setHideKo] = useState(false)
  const [revealed, setRevealed] = useState(() => new Set())

  const analysisByChapter = useMemo(() => {
    const map = new Map()
    for (const a of analysis?.chapters ?? []) map.set(a.number, a)
    return map
  }, [analysis])

  const wl = useWordLayer({ levels, dict, phrases, cards, commit })

  // 즐겨찾기한 줄. 이 두 작품은 자막이 이미 한 줄씩 나뉘어 있고 번역도
  // 있어서, 담으면 그대로 한↔영 복습 카드가 된다.
  const savedLines = useMemo(
    () => new Set((cards ?? []).filter((c) => c.type === 'line').map((c) => c.id)),
    [cards]
  )

  function toggleLine(chapter, index, line) {
    const id = lineId(work.id, chapter.number, index)
    if (savedLines.has(id)) {
      commit((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== id) }))
      return
    }
    const card = cardFromLine({
      work: work.id,
      workTitle: work.title,
      chapter: chapter.number,
      chapterTitle: chapter.title,
      index,
      en: line.en,
      ko: line.ko || line.koFluent || null,
      speaker: line.speaker,
    })
    commit((s) => ({ ...s, cards: [...s.cards, card] }))
  }

  if (selected == null) {
    return (
      <div className="stack stack--loose">
        <div className="row row--between">
          <button className="btn btn--ghost btn--sm" onClick={onBack}>
            ← 작품 목록
          </button>
          <span className="chip">{work.lineCount.toLocaleString('ko')}줄</span>
        </div>

        <div>
          <h2>{work.title}</h2>
          <p className="hint" style={{ marginTop: 'var(--s2)' }}>
            {work.subtitle}
          </p>
        </div>

        <section className="panel panel--flush">
          <div className="list">
            {work.chapters.map((c) => (
              <button
                key={c.number}
                className="list__item"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 0,
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onClick={() => {
                  setSelected(c.number)
                  setSection('script')
                  setRevealed(new Set())
                }}
              >
                <span className="list__main">
                  <span className="list__title">{c.title}</span>
                  <span className="list__meta">{c.lineCount}줄</span>
                  <SheetReadMeter read={readOf(reads, work.id, c.number)} />
                </span>
                {analysisByChapter.has(c.number) && (
                  <span className="chip chip--accent">해설</span>
                )}
                <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>
                  →
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const chapter = work.chapters.find((c) => c.number === selected)
  const chapterAnalysis = analysisByChapter.get(selected) ?? null

  return (
    <div className="stack stack--loose">
      <div className="row row--between">
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => setSelected(null)}
        >
          ← {work.title}
        </button>
        <div className="row" style={{ gap: 'var(--s2)' }}>
          {section === 'script' && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setHideKo((v) => !v)
              setRevealed(new Set())
            }}
            aria-pressed={hideKo}
            title="독해 연습용. 켜면 번역이 가려지고 줄마다 눌러서 확인합니다."
          >
            {hideKo ? '번역 켜기' : '번역 가리기'}
          </button>
          )}
          <span className="chip">{chapter.lineCount}줄</span>
        </div>
      </div>

      <div>
        <h3>{chapter.title}</h3>
        {chapter.locationNote && (
          <p className="hint" style={{ marginTop: 'var(--s2)' }}>
            {chapter.locationNote}
          </p>
        )}
      </div>


      {chapterAnalysis && (
        <nav className="tabs" role="tablist" aria-label="챕터 내 화면">
          {/* 시트 작품에는 챕터별 단어 자료가 없어 '단어' 탭은 뺀다 */}
          {SECTIONS.filter((sec) => sec.id !== 'vocab').map((sec) => (
            <button
              key={sec.id}
              role="tab"
              aria-selected={section === sec.id}
              className="tab"
              onClick={() => setSection(sec.id)}
            >
              {sec.label}
            </button>
          ))}
        </nav>
      )}

      {section !== 'script' &&
        (chapterAnalysis ? (
          <AnalysisSection section={section} analysis={chapterAnalysis} />
        ) : (
          <NotGenerated />
        ))}

      {section === 'script' && (
      <section className="stack">
        {chapter.lines.map((line, i) => {
          const open = !hideKo || revealed.has(i)
          const hasKo = Boolean(line.ko || line.koFluent)
          return (
            <article
              className="stack stack--tight"
              key={i}
              style={{
                paddingBottom: 'var(--s3)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div className="row row--between">
                {line.speaker ? (
                  <div className="speaker">{line.speaker}</div>
                ) : (
                  <span />
                )}
                <button
                  className={`star${
                    savedLines.has(lineId(work.id, chapter.number, i)) ? ' is-on' : ''
                  }`}
                  onClick={() => toggleLine(chapter, i, line)}
                  aria-pressed={savedLines.has(lineId(work.id, chapter.number, i))}
                  title={
                    savedLines.has(lineId(work.id, chapter.number, i))
                      ? '즐겨찾기에서 빼기'
                      : '이 문장 담기'
                  }
                >
                  {savedLines.has(lineId(work.id, chapter.number, i)) ? '★' : '☆'}
                </button>
              </div>

              <p
                className={line.lyric ? 'read direction' : 'read'}
                style={{ margin: 0 }}
              >
                {line.lyric && '♪ '}
                <WordText
                  text={line.en}
                  levels={wl.levels}
                  dict={wl.dict}
                  phrases={wl.phrases}
                  statusMap={wl.statusMap}
                  onWord={wl.openWord}
                  onPhrase={wl.openPhrase}
                />
                {line.lyric && ' ♪'}
              </p>

              {hasKo &&
                (open ? (
                  <p className="ko" style={{ margin: 0 }}>
                    {line.ko || line.koFluent}
                  </p>
                ) : (
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ justifySelf: 'start', color: 'var(--text-faint)' }}
                    onClick={() =>
                      setRevealed((prev) => new Set(prev).add(i))
                    }
                  >
                    번역 보기
                  </button>
                ))}
            </article>
          )
        })}
      </section>
      )}

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

      {/* 회독 표시는 본문 아래에 — 다 읽고 누르는 것이다 */}
      <SheetReadTracker
        read={readOf(reads, work.id, selected)}
        onMark={() => commit((s) => markRead(s, work.id, selected))}
        onUndo={() => commit((s) => undoRead(s, work.id, selected))}
      />

      <ChapterNav
        chapters={work.chapters}
        current={selected}
        onGo={(n) => {
          setSelected(n)
          setRevealed(new Set())
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

/** 챕터 목록의 회독 한 줄. Read.jsx와 같은 규칙으로 그린다. */
function SheetReadMeter({ read }) {
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

function SheetReadTracker({ read, onMark, onUndo }) {
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
