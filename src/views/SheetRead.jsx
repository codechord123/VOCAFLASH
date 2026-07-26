import { useMemo, useState } from 'react'
import { SECTIONS, AnalysisSection, NotGenerated } from './Read.jsx'
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

export default function SheetRead({ work, analysis, onBack }) {
  const [selected, setSelected] = useState(null)
  const [section, setSection] = useState('script')
  const [hideKo, setHideKo] = useState(false)
  const [revealed, setRevealed] = useState(() => new Set())

  const analysisByChapter = useMemo(() => {
    const map = new Map()
    for (const a of analysis?.chapters ?? []) map.set(a.number, a)
    return map
  }, [analysis])

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
              {line.speaker && <div className="speaker">{line.speaker}</div>}

              <p
                className={line.lyric ? 'read direction' : 'read'}
                style={{ margin: 0 }}
              >
                {line.lyric ? `♪ ${line.en} ♪` : line.en}
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
