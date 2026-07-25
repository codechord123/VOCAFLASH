import { useEffect, useMemo, useState } from 'react'
import { GRADES, applyGrade, selectDueCards, MAX_BOX } from '../lib/srs.js'
import { COLOR_LABELS, KIND_LABELS } from '../lib/deck.js'

// 오늘 화면. 앱을 켜면 여기가 먼저 나오고, 이미 복습할 카드가 채워져
// 있다. "무언가 입력해야 시작되는" 상태를 만들지 않는 것이 목적이다 —
// 준비 비용이 습관을 죽이는 지점이었다.

const GRADE_BUTTONS = [
  { grade: GRADES.AGAIN, label: '몰랐음', key: '1', cls: 'grade--again' },
  { grade: GRADES.HARD, label: '헷갈림', key: '2', cls: 'grade--hard' },
  { grade: GRADES.GOOD, label: '알았음', key: '3', cls: 'grade--good' },
]

export default function Today({ cards, stats, settings, commit, onGoTo }) {
  const queue = useMemo(
    () => selectDueCards(cards, { limit: settings.dailyLimit }),
    [cards, settings.dailyLimit]
  )

  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)

  const card = queue[index] ?? null

  function grade(g) {
    if (!card) return
    commit((s) => ({
      ...s,
      cards: s.cards.map((c) => (c.id === card.id ? applyGrade(c, g) : c)),
      reviewLog: [
        ...s.reviewLog,
        { at: Date.now(), cardId: card.id, grade: g, boxBefore: card.box },
      ],
    }))
    setRevealed(false)
    setDone((n) => n + 1)
    // queue는 commit 후 재계산되어 이 카드가 빠진다. index를 그대로 두면
    // 자연히 다음 카드가 온다.
    setIndex(0)
  }

  // 키보드 조작 — 이 앱의 주 사용 방식이다. 공백으로 뒤집고 1·2·3으로 평가.
  useEffect(() => {
    function onKey(e) {
      if (e.target.matches('input, textarea')) return
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault()
        setRevealed(true)
        return
      }
      if (!revealed) return
      const btn = GRADE_BUTTONS.find((b) => b.key === e.key)
      if (btn) {
        e.preventDefault()
        grade(btn.grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!cards.length) {
    return (
      <div className="empty">
        <div className="empty__icon">◆</div>
        <div className="empty__title">덱이 비어 있습니다</div>
        <p className="empty__body">
          설정에서 백업을 불러오거나, 페이지를 새로고침해 시드 데이터를 다시
          심어 주세요.
        </p>
        <button className="btn" onClick={() => onGoTo('settings')}>
          설정으로
        </button>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="stack stack--loose">
        <DeckSummary stats={stats} doneToday={done} />
        <div className="empty">
          <div className="empty__icon">✓</div>
          <div className="empty__title">
            {done > 0 ? `오늘 ${done}개 끝냈습니다` : '오늘 복습할 카드가 없습니다'}
          </div>
          <p className="empty__body">
            다음 카드는 간격에 따라 자동으로 올라옵니다. 더 하고 싶으면 원문을
            읽거나 문장 연습을 하세요.
          </p>
          <div className="row">
            <button className="btn" onClick={() => onGoTo('read')}>
              원문 읽기
            </button>
            <button className="btn btn--primary" onClick={() => onGoTo('drill')}>
              문장 연습
            </button>
          </div>
        </div>
      </div>
    )
  }

  const total = queue.length + done
  const progress = total ? (done / total) * 100 : 0

  return (
    <div className="stack stack--loose">
      <div className="stack stack--tight">
        <div className="meter-row__label">
          <span>
            오늘 복습 {done} / {total}
          </span>
          <span>남은 카드 {queue.length}</span>
        </div>
        <div className="progress">
          <div className="progress__bar" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <CardFace card={card} revealed={revealed} onReveal={() => setRevealed(true)} />

      {revealed ? (
        <div className="stack stack--tight">
          <div className="grade-row">
            {GRADE_BUTTONS.map((b) => (
              <button
                key={b.grade}
                className={`btn grade ${b.cls}`}
                onClick={() => grade(b.grade)}
              >
                <span>{b.label}</span>
                <span className="grade__key">{b.key}</span>
              </button>
            ))}
          </div>
          <p className="hint">
            숫자키 1·2·3으로도 평가할 수 있습니다. 「몰랐음」은 1일 뒤 다시
            나옵니다.
          </p>
        </div>
      ) : (
        <button className="btn btn--primary btn--block" onClick={() => setRevealed(true)}>
          답 보기 <span className="grade__key">Space</span>
        </button>
      )}
    </div>
  )
}

function CardFace({ card, revealed, onReveal }) {
  const isExpression = card.type === 'expression'

  return (
    <div
      className="flashcard"
      onClick={revealed ? undefined : onReveal}
      role={revealed ? undefined : 'button'}
      tabIndex={revealed ? undefined : 0}
      onKeyDown={(e) => {
        if (!revealed && (e.key === 'Enter' || e.key === ' ')) onReveal()
      }}
    >
      <div style={{ width: '100%' }}>
        <div className="row" style={{ justifyContent: 'center', marginBottom: 'var(--s4)' }}>
          <SourceChips card={card} />
        </div>

        <div className="flashcard__front">{card.front}</div>

        {!revealed && (
          <p className="hint" style={{ marginTop: 'var(--s5)' }}>
            {isExpression ? '뜻을 떠올려 보세요' : '영어로 만들어 보세요'}
          </p>
        )}

        {revealed && (
          <div className="flashcard__back">
            <div className="flashcard__divider" />
            {isExpression ? <ExpressionBack card={card} /> : <SentenceBack card={card} />}
          </div>
        )}
      </div>
    </div>
  )
}

function ExpressionBack({ card }) {
  if (!card.back) {
    return (
      <div className="stack stack--tight">
        <div className="notice notice--warn">
          <span className="notice__icon">!</span>
          <span>
            이 표현은 아직 뜻이 없습니다. 본인이 표시해둔 표현이라 문맥으로
            뜻을 추측해 보세요.
          </span>
        </div>
        {card.context && <div className="flashcard__context">{card.context}</div>}
      </div>
    )
  }

  return (
    <div className="stack stack--tight">
      <div className="read read--lg">{card.back.meaningKo}</div>
      {card.back.definitionEn && (
        <p className="ko" style={{ fontStyle: 'italic' }}>{card.back.definitionEn}</p>
      )}
      {card.back.nuance && (
        <p className="hint" style={{ textAlign: 'left' }}>
          뉘앙스 — {card.back.nuance}
        </p>
      )}
      {card.phonetics && (
        <p className="hint" style={{ fontFamily: 'var(--font-mono)' }}>{card.phonetics}</p>
      )}
      {(card.synonyms?.length > 0 || card.antonyms?.length > 0) && (
        <div className="row" style={{ justifyContent: 'center' }}>
          {card.synonyms?.map((w) => (
            <span className="chip" key={`s-${w}`}>= {w}</span>
          ))}
          {card.antonyms?.map((w) => (
            <span className="chip" key={`a-${w}`}>↔ {w}</span>
          ))}
        </div>
      )}
      {card.exampleKo && <p className="ko">{card.exampleKo}</p>}
      {card.context && <div className="flashcard__context">{card.context}</div>}
    </div>
  )
}

function SentenceBack({ card }) {
  return (
    <div className="read read--lg" style={{ fontFamily: 'var(--font-read)' }}>
      {card.back.en}
    </div>
  )
}

function SourceChips({ card }) {
  const s = card.source ?? {}
  return (
    <>
      {card.origin === 'learner-highlight' && (
        <span className="chip chip--accent" title="본인이 하이라이트한 표현">
          내 표시
        </span>
      )}
      {card.origin === 'learner-note' && (
        <span className="chip chip--accent" title="본인이 직접 쓴 메모">
          내 메모
        </span>
      )}
      {card.kind && <span className="chip">{KIND_LABELS[card.kind] ?? card.kind}</span>}
      {card.color && COLOR_LABELS[card.color] && (
        <span className="chip">{COLOR_LABELS[card.color]}</span>
      )}
      {s.chapter != null && <span className="chip">Ch {s.chapter}</span>}
      {s.work && <span className="chip">{s.work}</span>}
      <span className="chip chip--box" title={`박스 ${card.box} / ${MAX_BOX}`}>
        {card.box}/{MAX_BOX}
      </span>
    </>
  )
}

function DeckSummary({ stats, doneToday }) {
  return (
    <div className="tiles">
      <div className="tile tile--accent">
        <div className="tile__value">{doneToday}</div>
        <div className="tile__label">오늘 복습</div>
      </div>
      <div className="tile">
        <div className="tile__value">{stats.total}</div>
        <div className="tile__label">전체 카드</div>
      </div>
      <div className="tile">
        <div className="tile__value">{stats.fresh}</div>
        <div className="tile__label">아직 안 본 것</div>
      </div>
      <div className="tile">
        <div className="tile__value">{stats.learned}</div>
        <div className="tile__label">외운 것 (박스 {MAX_BOX})</div>
      </div>
    </div>
  )
}
