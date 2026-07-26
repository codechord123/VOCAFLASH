import { useEffect } from 'react'

// 읽다 막힌 대목의 해설 시트.
//
// 구문 정리·문법은 챕터마다 이미 있는데, 탭을 갈아타 눈으로 찾아야 해서
// 읽는 흐름이 끊겼다. 그은 자리에서 바로 꺼내 보게 한다.
//
// 없으면 없다고 말한다. 대신 그 안에 든 표현이라도 보여주면, 최소한
// 어디서 막혔는지는 짚인다.

export default function ExplainSheet({ label, explain, onClose, onPhrase }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!explain) return null
  const { chunks, grammar, phrases } = explain
  const nothing = !chunks.length && !grammar.length && !phrases.length

  return (
    <>
      <div className="sheet__scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="이 대목 해설">
        <div className="sheet__grip" />

        <div className="row row--between">
          <div style={{ minWidth: 0 }}>
            <div className="hint" style={{ textAlign: 'left' }}>
              이 대목
            </div>
            <div className="read" style={{ fontSize: 17, marginTop: 2 }}>
              {label}
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="stack" style={{ marginTop: 'var(--s4)' }}>
          {chunks.length > 0 && (
            <section className="stack stack--tight">
              <div className="section-title">구문 정리</div>
              {chunks.map((c, i) => (
                <div className="panel" key={i}>
                  {/* 슬래시는 끊어 읽는 자리다. 줄을 바꿔 주면 눈으로 따라간다. */}
                  <div className="read" style={{ marginBottom: 'var(--s2)' }}>
                    {c.en.split('/').map((piece, j) => (
                      <span key={j} style={{ display: 'block' }}>
                        {piece.trim()}
                      </span>
                    ))}
                  </div>
                  {/* 직역과 뜻이 붙어 있으면 한 덩어리로 읽힌다.
                      어느 쪽이 구조를 보여주는 줄인지 이름을 붙여 준다. */}
                  {c.literal && (
                    <div className="ko">
                      <span className="hint">직역 </span>
                      {c.literal}
                    </div>
                  )}
                  <div className="ko" style={{ color: 'var(--text)' }}>
                    <span className="hint">뜻 </span>
                    {c.ko}
                  </div>
                </div>
              ))}
            </section>
          )}

          {grammar.length > 0 && (
            <section className="stack stack--tight">
              <div className="section-title">문법</div>
              {grammar.map((g, i) => (
                <div className="panel stack stack--tight" key={i}>
                  <h4>{g.point}</h4>
                  <p>{g.explanation}</p>
                  {g.fromScript && <div className="flashcard__context">{g.fromScript}</div>}
                  {g.example && <p className="hint">예문 — {g.example}</p>}
                </div>
              ))}
            </section>
          )}

          {phrases.length > 0 && (
            <section className="stack stack--tight">
              <div className="section-title">이 안에 든 표현</div>
              <div className="panel panel--flush">
                <div className="list">
                  {phrases.map((p) => (
                    <button
                      key={p.key}
                      className="list__item"
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 0,
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onClick={() => onPhrase?.(p)}
                    >
                      <span className="list__main">
                        <span className="list__title read">{p.text}</span>
                        <span className="list__meta">{p.entry?.ko}</span>
                      </span>
                      {p.entry?.alt && <span className="chip">문맥</span>}
                      <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {nothing && (
            <div className="empty">
              <div className="empty__title">이 대목은 정리된 해설이 없습니다</div>
              <p className="hint">
                구문 정리와 문법은 챕터마다 미리 만들어 둔 것이라, 모든 문장에 붙어 있지는
                않습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
