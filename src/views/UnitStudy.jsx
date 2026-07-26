import { useMemo, useState } from 'react'

// 유닛 학습지(커리큘럼 화면).
//
// 순서가 곧 학습법이다: 앵커(장면) → 규칙 → 예문 → 어휘 → 퀴즈.
// 규칙을 먼저 주지 않는다 — 셀린의 대사를 먼저 읽고, 그 리듬에 이름을
// 붙이는 쪽이 기억에 남는다.

/**
 * 유닛마다 눈에 걸려야 할 자리가 다르다.
 *
 * 앵커에서 그 유닛이 가르치는 구조에만 밑줄이 가야 한다 — would 유닛에서
 * would에 표시가 없으면 어디를 보라는 건지 알 수 없고, 반대로 상관없는
 * 곳까지 칠하면 소음이 된다. 규칙이 다루는 표현을 유닛별로 적어 둔다.
 */
const MARKS = {
  'u-01': ["no?", "right?", "This fine here?", "you coming", "You on holiday", "You get off"],
  'u-02': ["you know", "I mean", "well", "anyway", "kinda", "gonna", "dunno", "'cause", "ya", "umm", "uh"],
  'u-03': ["I guess", "sort of", "kind of", "or something", "I don't know", "supposedly", "maybe"],
  'u-04': ["I have never", "I've never", "I've", "We've", "Have you ever", "haven't"],
  'u-05': ["I've been", "been riding", "been wondering", "'s been", "been having"],
  'u-06': ["had just", "had fought", "I'd seen", "I'd imagined", "had died", "had visited"],
  'u-07': ["I'd say", "he'd say", "he'd shave", "would", "'d"],
  'u-08': ["bigger", "than", "as big a", "just as", "more", "older"],
  'u-09': ["Only if", "will you", "it's myself that", "is what I did", "Why is it"],
  'u-10': ["what I'd seen", "how ambiguous", "what generation", "What you do", "that would last", "as it's lived", "I don't think"],
  'u-11': ["see me falling", "watching", "experiencing", "trying to take", "looking at"],
  'u-12': ["Would you be", "hadn't", "would have", "should have", "she'd", "gave me the choice", "I would marry"],
  'u-13': ["I wish", "I wished", "I'd been", "had met", "wishing"],
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 이 유닛이 가르치는 표현에 표시를 남긴다. 긴 것부터 잡아야 겹치지 않는다. */
function AnchorText({ text, unitId }) {
  const marks = MARKS[unitId] ?? []
  const parts = useMemo(() => {
    if (marks.length === 0) return [text]
    const re = new RegExp(
      `(${[...marks].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})`,
      'gi'
    )
    return text.split(re)
  }, [text, unitId])

  const isMark = (p) =>
    marks.some((m) => m.toLowerCase() === (p ?? '').toLowerCase())

  return (
    <p className="read" style={{ fontSize: 17, lineHeight: 1.75 }}>
      {parts.map((p, i) =>
        isMark(p) ? (
          <span className="hl" key={i}>
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </p>
  )
}

const LEVEL_ORDER = ['L1', 'L2', 'L3', 'L4']

export default function UnitStudy({ unit, vocabById, progress, onBack, onStartQuiz }) {
  const done = progress?.screen === 'done'

  const vocabByLevel = useMemo(() => {
    const groups = new Map(LEVEL_ORDER.map((l) => [l, []]))
    for (const id of unit.vocabIds) {
      const w = vocabById.get(id)
      if (w) groups.get(w.level)?.push(w)
    }
    return groups
  }, [unit, vocabById])

  const levelNames = { L1: '생활', L2: '뉘앙스', L3: '추상', L4: '관용' }

  return (
    <div className="stack stack--loose">
      <div className="row row--between">
        <button className="btn btn--ghost btn--sm" onClick={onBack}>
          ← 유닛 목록
        </button>
        {done && <span className="chip chip--box">완료 · {progress.quizScore}/20</span>}
      </div>

      <header className="stack stack--tight">
        <h1>
          Unit {unit.order} · {unit.title}
        </h1>
        <p className="hint">{unit.tagline}</p>
      </header>

      {/* 앵커 — 대본 원문이 이 유닛의 본문이다 */}
      <section className="stack">
        <div className="section-title">앵커 장면</div>
        {unit.anchors.map((a, i) => (
          <article className="panel stack" key={i} style={{ gap: 'var(--s3)' }}>
            <AnchorText text={a.en} unitId={unit.unitId} />
            <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: 0 }}>{a.ko}</p>
            <div className="row row--between">
              <span className="chip">
                {a.speaker} · Ch {a.chapter}
              </span>
            </div>
            <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
              {a.sceneNote}
            </p>
          </article>
        ))}
      </section>

      {/* 규칙 */}
      <section className="stack">
        <div className="section-title">규칙</div>
        {unit.rules.map((r, i) => (
          <article className="panel stack stack--tight" key={r.id}>
            <div className="row row--between">
              <h4 style={{ margin: 0 }}>
                {i + 1}. {r.title}
              </h4>
              {r.isTrap && (
                <span className="chip" style={{ color: 'var(--again)' }}>
                  함정
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-dim)', margin: 0 }}>{r.body}</p>
          </article>
        ))}
      </section>

      {/* 생성 예문 — 앵커 밖에서도 같은 패턴이 돌아가는 걸 본다 */}
      <section className="stack">
        <div className="section-title">더 보는 예문</div>
        <div className="panel stack" style={{ gap: 'var(--s3)' }}>
          {unit.generatedExamples.map((ex, i) => (
            <div className="stack stack--tight" key={i}>
              <AnchorText text={ex.en} unitId={unit.unitId} />
              <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0 }}>
                {ex.ko}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 배정 어휘 — 탭하면 뜻이 열린다 */}
      <section className="stack">
        <div className="section-title">배정 어휘 · {unit.vocabIds.length}개</div>
        <p className="hint">
          이 유닛의 장면에서 나온 단어입니다. 탭해서 뜻을 확인하세요 —
          퀴즈를 마치면 핵심 단어가 카드로 복습 덱에 들어갑니다.
        </p>
        {LEVEL_ORDER.map((level) => {
          const words = vocabByLevel.get(level) ?? []
          if (words.length === 0) return null
          return (
            <div className="stack stack--tight" key={level}>
              <div className="hint" style={{ textAlign: 'left' }}>
                {level} · {levelNames[level]}
              </div>
              {words.map((w) => (
                <VocabRow key={w.wordId} word={w} />
              ))}
            </div>
          )
        })}
      </section>

      <button className="btn btn--primary btn--block" onClick={onStartQuiz}>
        {done ? '퀴즈 다시 풀기 (20문항)' : '퀴즈 풀기 — 20문항'}
      </button>
    </div>
  )
}

function VocabRow({ word }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      className="panel"
      onClick={() => setOpen((v) => !v)}
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
          {word.lemma}
        </span>
        <span style={{ color: 'var(--text-faint)' }}>{open ? '−' : '+'}</span>
      </div>
      {open && (
        <div className="stack stack--tight" style={{ marginTop: 'var(--s2)' }}>
          <div>{word.meaningKo}</div>
          {word.nuance && (
            <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
              {word.nuance}
            </p>
          )}
          {word.sources?.[0] && (
            <p className="flashcard__context" style={{ margin: 0 }}>
              {word.sources[0].context}
              {word.sources[0].speaker && ` — ${word.sources[0].speaker}`}
            </p>
          )}
        </div>
      )}
    </button>
  )
}
