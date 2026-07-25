/** 챕터 하단의 이전/다음 이동. 다 읽고 나서 목록으로 돌아가지 않아도
    바로 다음 장으로 넘어갈 수 있어야 한다 — 목록을 거치게 만들면
    거기서 흐름이 끊긴다. */
export default function ChapterNav({ chapters, current, onGo, onList }) {
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
