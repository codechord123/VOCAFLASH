import { useState } from 'react'

// 시트에서 온 작품(Disenchantment, Before Sunset)의 읽기 화면.
//
// Before Sunrise와 다르게 하이라이트도 챕터 해설도 없다 — 자막
// 한영 대응만 있다. 그래서 화면도 다르다: 해설 탭을 만드는 대신
// 번역을 가리는 기능을 넣었다.
//
// 번역 가리기가 이 화면의 핵심이다. 한영이 나란히 있으면 눈이
// 한국어로 먼저 가서 영어를 읽지 않게 된다. 가려놓고 읽다가 막힐
// 때만 열어보는 게 실제 독해 연습이다.

export default function SheetRead({ work, onBack }) {
  const [selected, setSelected] = useState(null)
  const [hideKo, setHideKo] = useState(true)
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
            className="btn btn--sm"
            onClick={() => {
              setHideKo((v) => !v)
              setRevealed(new Set())
            }}
            aria-pressed={hideKo}
          >
            {hideKo ? '번역 가림' : '번역 보임'}
          </button>
          <span className="chip">{chapter.lineCount}줄</span>
        </div>
      </div>

      <h3>{chapter.title}</h3>

      {hideKo && (
        <div className="notice">
          <span className="notice__icon" aria-hidden="true">
            ◆
          </span>
          <span>
            번역이 가려져 있습니다. 막히는 줄만 눌러서 확인하세요 — 나란히
            보면 눈이 한국어로 먼저 가서 영어를 읽지 않게 됩니다.
          </span>
        </div>
      )}

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

      <button
        className="btn btn--block"
        onClick={() => {
          setSelected(null)
          window.scrollTo({ top: 0 })
        }}
      >
        ← {work.title} 목록으로
      </button>
    </div>
  )
}
