import { useMemo, useState } from 'react'

// 통합 문법 색인.
//
// 노션에 `모든 문법 및 표현 정리`라는 빈 페이지가 있었다. 만들려다
// 못 한 것이다. 23챕터에 흩어진 문법 173개를 주제별로 묶어 그 자리를
// 채운다.
//
// 챕터별 보기로는 안 보이는 것이 여기서 보인다 — 같은 구문이 2장,
// 8장, 19장에 반복해서 나왔다는 사실 자체가 학습 정보다.

export default function Grammar({ index, onOpenChapter }) {
  const [query, setQuery] = useState('')
  const [openGroup, setOpenGroup] = useState(index?.groups?.[0]?.id ?? null)

  const groups = index?.groups ?? []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        entries: g.entries.filter((e) =>
          [e.point, e.explanation, e.example, ...(e.fromScript ?? [])]
            .join(' ')
            .toLowerCase()
            .includes(q)
        ),
      }))
      .filter((g) => g.entries.length > 0)
  }, [groups, query])

  const totalEntries = useMemo(
    () => groups.reduce((n, g) => n + g.entries.length, 0),
    [groups]
  )

  if (groups.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">◆</div>
        <div className="empty__title">문법 색인이 아직 없습니다</div>
        <p className="empty__body">
          챕터 해설을 먼저 생성한 뒤 색인을 만들 수 있습니다.
        </p>
      </div>
    )
  }

  // 검색 중에는 결과를 다 펼친다 — 접힌 채로는 찾은 걸 못 본다.
  const searching = query.trim().length > 0

  return (
    <div className="stack stack--loose">
      <header className="stack stack--tight">
        <h1>{index.title}</h1>
        <p className="hint">{index.subtitle}</p>
      </header>

      <div className="tiles">
        <div className="tile tile--accent">
          <div className="tile__value">{totalEntries}</div>
          <div className="tile__label">구문 항목</div>
        </div>
        <div className="tile">
          <div className="tile__value">{groups.length}</div>
          <div className="tile__label">주제</div>
        </div>
        <div className="tile">
          <div className="tile__value">{index.totalPoints ?? '—'}</div>
          <div className="tile__label">원본 문법 설명</div>
        </div>
      </div>

      <div className="field">
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="구문·설명·예문 검색 (도치, would, no? …)"
          aria-label="문법 검색"
        />
      </div>

      {filtered.length === 0 && (
        <div className="empty">
          <div className="empty__icon">⌕</div>
          <div className="empty__title">검색 결과가 없습니다</div>
          <p className="empty__body">
            다른 말로 찾아보세요. 한국어 설명과 영어 예문 모두 검색됩니다.
          </p>
        </div>
      )}

      {filtered.map((group) => {
        const open = searching || openGroup === group.id
        return (
          <section className="panel panel--flush" key={group.id}>
            <button
              className="list__item"
              style={{ width: '100%', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}
              onClick={() => setOpenGroup(open && !searching ? null : group.id)}
              aria-expanded={open}
            >
              <span className="list__main">
                <span className="list__title">{group.title}</span>
                <span className="list__meta">{group.summary}</span>
              </span>
              <span className="chip">{group.entries.length}</span>
              <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>
                {open ? '−' : '+'}
              </span>
            </button>

            {open && (
              <div className="stack" style={{ padding: 'var(--s4)', paddingTop: 0 }}>
                {group.entries.map((entry, i) => (
                  <article
                    className="stack stack--tight"
                    key={`${group.id}-${i}`}
                    style={{
                      paddingTop: 'var(--s4)',
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <div className="row row--between">
                      <h4>{entry.point}</h4>
                      <div className="row" style={{ gap: 'var(--s1)' }}>
                        {(entry.chapters ?? []).map((n) => (
                          <button
                            key={n}
                            className="chip chip--box"
                            onClick={() => onOpenChapter?.(n)}
                            title={`${n}장으로 이동`}
                            style={{ cursor: 'pointer' }}
                          >
                            {n}장
                          </button>
                        ))}
                      </div>
                    </div>

                    <p style={{ color: 'var(--text-dim)' }}>{entry.explanation}</p>

                    {(entry.fromScript ?? []).map((line, j) => (
                      <p className="read" key={j} style={{ fontSize: 16 }}>
                        <span className="hl">{line}</span>
                      </p>
                    ))}

                    {entry.example && (
                      <p className="hint">
                        예문 — <span className="read" style={{ fontSize: 15 }}>{entry.example}</span>
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
