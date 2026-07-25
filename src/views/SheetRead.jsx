import { useState } from 'react'

// 시트에서 온 작품(Disenchantment, Before Sunset)의 읽기 화면.
//
// Before Sunrise와 같은 방식으로 읽는다 — 원문과 번역을 나란히 둔다.
// 이 두 편은 하이라이트도 챕터 해설도 없어서 섹션 탭이 없을 뿐이고,
// 읽는 경험 자체는 기존 리더와 같게 유지한다.
//
// 번역 가리기는 원하면 켜는 선택 기능으로만 둔다(기본 꺼짐).

export default function SheetRead({ work, onBack }) {
  const [selected, setSelected] = useState(null)
  const [hideKo, setHideKo] = useState(false)
  const [revealed, setRevealed] = useState(() => new Set())

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
                  setRevealed(new Set())
                }}
              >
                <span className="list__main">
                  <span className="list__title">{c.title}</span>
                  <span className="list__meta">{c.lineCount}줄</span>
                </span>
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
          <span className="chip">{chapter.lineCount}줄</span>
        </div>
      </div>

      <h3>{chapter.title}</h3>

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

/** 챕터 하단의 이전/다음 이동. 다 읽고 나서 목록으로 돌아가지 않아도
    바로 다음 장으로 넘어갈 수 있어야 한다 — 목록을 거치게 만들면
    거기서 흐름이 끊긴다. */
export function ChapterNav({ chapters, current, onGo, onList }) {
  const i = chapters.findIndex((c) => c.number === current)
  const prev = i > 0 ? chapters[i - 1] : null
  const next = i >= 0 && i < chapters.length - 1 ? chapters[i + 1] : null

  return (
    <nav
      className="row"
      style={{ gap: 'var(--s2)', alignItems: 'stretch' }}
      aria-label="챕터 이동"
    >
      <button
        className="btn"
        style={{ flex: 1, justifyContent: 'flex-start', minWidth: 0 }}
        disabled={!prev}
        onClick={() => prev && onGo(prev.number)}
        title={prev?.title ?? ''}
      >
        <span aria-hidden="true">←</span>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {prev ? prev.title : '처음 장'}
        </span>
      </button>

      <button className="btn btn--ghost" onClick={onList} title="챕터 목록">
        목록
      </button>

      <button
        className="btn btn--primary"
        style={{ flex: 1, justifyContent: 'flex-end', minWidth: 0 }}
        disabled={!next}
        onClick={() => next && onGo(next.number)}
        title={next?.title ?? ''}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {next ? next.title : '마지막 장'}
        </span>
        <span aria-hidden="true">→</span>
      </button>
    </nav>
  )
}
