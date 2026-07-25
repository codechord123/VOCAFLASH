import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GRADES, applyGrade } from '../lib/srs.js'

// 스와이프 플래시카드.
//
// 요구는 명확했다: "아는 단어 모르는 단어 구분해서 모르는 것만 보고 싶다."
// 그래서 세션 안에서 두 번 돈다.
//
//   1회차 — 카드를 넘기며 아는 것(→)과 모르는 것(←)으로 가른다
//   2회차 — 모르는 것만 다시 돈다. 여기서도 모르면 계속 남는다
//
// 버튼을 누르는 것보다 스와이프가 나은 이유: 판단이 즉각적이고 손이
// 화면을 떠나지 않는다. 200장을 넘기는 일이라 그 차이가 크다.
//
// 입력은 세 가지를 모두 받는다 — 터치(스와이프), 마우스(드래그),
// 키보드(← → 스페이스). 하나만 지원하면 기기가 바뀔 때 못 쓴다.

const THRESHOLD = 90 // 이만큼 끌면 넘긴 것으로 본다
const ROTATE = 0.045 // 끌린 거리에 비례한 기울기
const CONTEXT_MAX = 140 // 이보다 긴 문맥은 카드에 싣지 않는다

export default function Swipe({ cards, settings, commit, onExit }) {
  const [queue, setQueue] = useState(() => cards.map((c) => c.id))
  const [round, setRound] = useState(1)
  const [unknown, setUnknown] = useState(() => [])
  const [knownCount, setKnownCount] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [drag, setDrag] = useState(0)
  const [leaving, setLeaving] = useState(null) // 'known' | 'unknown'

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const card = queue.length > 0 ? byId.get(queue[0]) : null

  const startX = useRef(null)
  const startY = useRef(null)
  const dragging = useRef(false)
  // 제스처의 방향을 한 번 정하면 끝까지 유지한다.
  // null=미정, 'x'=넘기기, 'y'=스크롤(카드는 반응하지 않음)
  const axis = useRef(null)

  /**
   * 카드 하나를 처리한다.
   *
   * SRS와 연결한다 — 스와이프는 별도 놀이가 아니라 복습의 입력 방식이다.
   * 모름은 박스 1로 되돌리고, 앎은 다음 박스로 올린다. 2회차에서 맞힌
   * 것은 '한 번 틀린 뒤 맞힌 것'이라 HARD로 기록한다. 한 번에 맞힌 것과
   * 같이 취급하면 간격이 너무 빨리 벌어진다.
   */
  const settle = useCallback(
    (known) => {
      if (!card) return
      const grade = known
        ? round === 1
          ? GRADES.GOOD
          : GRADES.HARD
        : GRADES.AGAIN

      commit((s) => ({
        ...s,
        cards: s.cards.map((c) => (c.id === card.id ? applyGrade(c, grade) : c)),
        reviewLog: [
          ...s.reviewLog,
          {
            at: Date.now(),
            cardId: card.id,
            grade,
            round,
            via: 'swipe',
          },
        ],
      }))

      if (known) setKnownCount((n) => n + 1)
      else setUnknown((u) => [...u, card.id])

      setLeaving(known ? 'known' : 'unknown')
      // 카드가 날아가는 것을 보여준 뒤 큐에서 뺀다. 즉시 바꾸면
      // 무엇을 판정했는지 확인할 틈이 없다.
      window.setTimeout(() => {
        setQueue((q) => q.slice(1))
        setFlipped(false)
        setDrag(0)
        setLeaving(null)
      }, 180)
    },
    [card, round, commit]
  )

  // 키보드: ← 모름, → 앎, 스페이스 뒤집기
  useEffect(() => {
    function onKey(e) {
      if (leaving) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        settle(false)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        settle(true)
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settle, leaving])

  // ── 포인터 처리 (터치·마우스 공통) ──────────────────────────────
  function onPointerDown(e) {
    if (leaving) return
    dragging.current = true
    axis.current = null
    startX.current = e.clientX
    startY.current = e.clientY
    // 포인터를 잡아두면 세로 스크롤이 막힌다. 방향이 정해진 뒤에만 잡는다.
  }

  function onPointerMove(e) {
    if (!dragging.current || startX.current == null) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current

    // 방향 결정: 먼저 10px을 넘긴 축이 이긴다. 세로면 카드는 가만히
    // 있고 브라우저가 스크롤한다 — 스크롤하려다 카드가 뒤집히던 문제.
    if (axis.current === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (axis.current === 'x') e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    if (axis.current !== 'x') return

    setDrag(dx)
  }

  function onPointerUp(e) {
    if (!dragging.current) return
    dragging.current = false
    const dx = drag
    const movedY = Math.abs((e?.clientY ?? startY.current) - startY.current)
    const wasScroll = axis.current === 'y'
    startX.current = null
    startY.current = null
    axis.current = null

    if (wasScroll) {
      setDrag(0)
      return
    }
    if (Math.abs(dx) >= THRESHOLD) {
      settle(dx > 0)
      return
    }
    // 제자리 탭만 뒤집기로 본다. 세로로 조금이라도 끌었으면 스크롤 의도다.
    if (Math.abs(dx) < 6 && movedY < 6) setFlipped((v) => !v)
    setDrag(0)
  }

  // ── 회차 전환 ───────────────────────────────────────────────────
  const roundDone = queue.length === 0

  function startNextRound() {
    setQueue(unknown)
    setUnknown([])
    setKnownCount(0)
    setRound((r) => r + 1)
    setFlipped(false)
  }

  if (cards.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">◆</div>
        <div className="empty__title">넘길 카드가 없습니다</div>
        <p className="empty__body">덱을 골라 주세요.</p>
        <button className="btn" onClick={onExit}>
          돌아가기
        </button>
      </div>
    )
  }

  if (roundDone) {
    const done = unknown.length === 0
    return (
      <div className="stack stack--loose">
        <div className="empty">
          <div className="empty__icon">{done ? '✓' : '↻'}</div>
          <div className="empty__title">
            {round}회차 끝 — 아는 것 {knownCount}개
            {unknown.length > 0 && `, 모르는 것 ${unknown.length}개`}
          </div>
          <p className="empty__body">
            {done
              ? '모두 아는 것으로 넘겼습니다. 오늘 몫은 끝났습니다.'
              : `모르는 것만 ${unknown.length}개 다시 돕니다. 아는 것으로 넘길 때까지 남습니다.`}
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            {!done && (
              <button className="btn btn--primary" onClick={startNextRound}>
                모르는 것 {unknown.length}개 다시 보기
              </button>
            )}
            <button className="btn" onClick={onExit}>
              나가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  const total = round === 1 ? cards.length : queue.length + knownCount
  const at = total - queue.length + 1
  const intent = leaving ?? (Math.abs(drag) >= THRESHOLD ? (drag > 0 ? 'known' : 'unknown') : null)

  return (
    <div className="stack stack--loose">
      <div className="row row--between">
        <button className="btn btn--ghost btn--sm" onClick={onExit}>
          ← 나가기
        </button>
        <div className="row" style={{ gap: 'var(--s2)' }}>
          {round > 1 && <span className="chip chip--accent">{round}회차</span>}
          <span className="chip">
            {at} / {total}
          </span>
        </div>
      </div>

      <div className="progress">
        <div
          className="progress__bar"
          style={{ width: `${((at - 1) / total) * 100}%` }}
        />
      </div>

      <div className="swipe">
        {/* 판정 방향 표시. 끌기 시작하면 어느 쪽으로 가는지 보여야 한다 */}
        <div className={`swipe__hint swipe__hint--left${intent === 'unknown' ? ' is-on' : ''}`}>
          모름
        </div>
        <div className={`swipe__hint swipe__hint--right${intent === 'known' ? ' is-on' : ''}`}>
          앎
        </div>

        <article
          className="flashcard swipe__card"
          style={{
            transform: leaving
              ? `translateX(${leaving === 'known' ? 520 : -520}px) rotate(${
                  leaving === 'known' ? 18 : -18
                }deg)`
              : `translateX(${drag}px) rotate(${drag * ROTATE}deg)`,
            opacity: leaving ? 0 : 1,
            transition: leaving || drag === 0 ? 'transform 180ms var(--ease), opacity 180ms' : 'none',
            touchAction: 'pan-y',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="stack" style={{ width: '100%' }}>
            <div className="row" style={{ justifyContent: 'center', gap: 'var(--s2)' }}>
              <span className="chip">
                ◆ {card.source?.work ?? '기타'}
              </span>
              <span className="chip chip--box">박스 {card.box}</span>
            </div>

            <div className="flashcard__front">{card.front}</div>
            {card.phonetics && (
              <div className="hint" style={{ fontFamily: 'var(--font-mono)' }}>
                {card.phonetics}
              </div>
            )}

            {flipped ? (
              <div className="flashcard__back stack">
                <div className="flashcard__divider" />
                <div className="read" style={{ fontSize: 20 }}>
                  {card.back?.meaningKo}
                </div>
                {card.back?.definitionEn && (
                  <p className="hint">{card.back.definitionEn}</p>
                )}
                {card.back?.nuance && (
                  <p className="hint" style={{ textAlign: 'left' }}>
                    뉘앙스 — {card.back.nuance}
                  </p>
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
                {/* 문맥은 짧을 때만 보여준다. 하이라이트의 context는
                    대사 한 줄이 아니라 독백 전체인 경우가 있어서, 그대로
                    띄우면 카드가 원문 뭉치가 된다. */}
                {card.context && card.context.length <= CONTEXT_MAX && (
                  <p className="flashcard__context">{card.context}</p>
                )}
                {card.exampleKo && <p className="ko">{card.exampleKo}</p>}
              </div>
            ) : (
              <p className="hint">눌러서 뜻 보기</p>
            )}
          </div>
        </article>
      </div>

      <div className="grade-row">
        <button className="btn grade grade--again" onClick={() => settle(false)}>
          ← 모름
          <span className="grade__key">왼쪽으로 넘기기</span>
        </button>
        <button className="btn grade" onClick={() => setFlipped((v) => !v)}>
          {flipped ? '앞면' : '뜻 보기'}
          <span className="grade__key">스페이스</span>
        </button>
        <button className="btn grade grade--good" onClick={() => settle(true)}>
          앎 →
          <span className="grade__key">오른쪽으로 넘기기</span>
        </button>
      </div>

      <p className="hint" style={{ textAlign: 'center' }}>
        카드를 좌우로 끌어서 넘기세요. 키보드 ← → 도 됩니다.
      </p>
    </div>
  )
}
