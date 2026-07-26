import { useState } from 'react'
import Read from './Read.jsx'
import SheetRead from './SheetRead.jsx'

// 읽기 파트의 입구. 작품을 고르면 각 작품에 맞는 리더로 넘긴다.
//
// 작품마다 가진 자료가 다르므로 화면도 다르다:
//   Before Sunrise — 노션에서 온 원문 + 하이라이트 + 챕터 해설
//   나머지 두 편   — 시트에서 온 한영 자막 대응 (번역 가리기)
// 억지로 한 화면에 맞추면 둘 다 나빠진다.

export default function ReadPart({
  chapters,
  analysis,
  sheetWorks,
  sheetAnalysis = {},
  levels,
  dict,
  phrases,
  reads,
  cards,
  commit,
  initialChapter = null,
}) {
  // 문법 색인에서 챕터로 건너뛴 경우 바로 Before Sunrise를 연다.
  const [workId, setWorkId] = useState(initialChapter != null ? 'before-sunrise' : null)

  const sunriseChapters = chapters.filter((c) => c.lines?.length > 0)
  const analyzedCount = analysis?.chapters?.length ?? 0

  if (workId === 'before-sunrise') {
    return (
      <div className="stack">
        <button
          className="btn btn--ghost btn--sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setWorkId(null)}
        >
          ← 작품 목록
        </button>
        <Read
          chapters={chapters}
          analysis={analysis}
          levels={levels}
          dict={dict}
          phrases={phrases}
          reads={reads}
          cards={cards}
          commit={commit}
          initialChapter={initialChapter}
        />
      </div>
    )
  }

  const sheetWork = sheetWorks.find((w) => w.id === workId)
  if (sheetWork) {
    return (
      <SheetRead
        work={sheetWork}
        analysis={sheetAnalysis[sheetWork.id] ?? null}
        levels={levels}
        dict={dict}
        phrases={phrases}
        reads={reads}
        cards={cards}
        commit={commit}
        onBack={() => setWorkId(null)}
      />
    )
  }

  return (
    <div className="stack stack--loose">
      <header className="stack stack--tight">
        <h1>읽기</h1>
        <p className="hint">
          원문과 번역을 나란히 읽습니다. Before Sunrise에는 구문 정리 ·
          문법 · 배경지식 · 이해도 확인이 챕터마다 붙어 있습니다.
        </p>
      </header>

      <section className="stack">
        <div className="section-title">작품</div>

        <WorkCard
          title="Before Sunrise"
          subtitle="1995 · 비포 3부작 1편"
          meta={`${sunriseChapters.length}장 · 해설 ${analyzedCount}장`}
          detail="구문 정리 · 문법 · 배경지식 · 이해도 확인이 챕터마다 붙어 있습니다."
          onClick={() => setWorkId('before-sunrise')}
          featured
        />

        {sheetWorks.map((w) => (
          <WorkCard
            key={w.id}
            title={w.title}
            subtitle={w.subtitle}
            meta={`${w.chapterCount}장 · ${w.lineCount.toLocaleString('ko')}줄`}
            detail={
              (sheetAnalysis[w.id]?.chapterCount ?? 0) > 0
                ? `구문 정리 · 문법 · 배경지식 · 이해도 확인이 ${w.chapterCount}장 중 ${sheetAnalysis[w.id].chapterCount}장에 붙어 있습니다.`
                : '원문과 번역을 나란히 읽습니다.'
            }
            onClick={() => setWorkId(w.id)}
          />
        ))}
      </section>
    </div>
  )
}

function WorkCard({ title, subtitle, meta, detail, onClick, featured }) {
  return (
    <button
      className="panel"
      onClick={onClick}
      style={{
        display: 'grid',
        gap: 'var(--s2)',
        textAlign: 'left',
        cursor: 'pointer',
        borderColor: featured ? 'var(--accent-border)' : undefined,
        background: featured ? 'var(--accent-soft)' : undefined,
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <div className="row row--between">
        <h3>{title}</h3>
        <span className="chip">{meta}</span>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {subtitle}
      </p>
      <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: 14 }}>{detail}</p>
    </button>
  )
}
