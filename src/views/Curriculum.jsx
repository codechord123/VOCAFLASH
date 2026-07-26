import { useMemo, useState } from 'react'
import UnitStudy from './UnitStudy.jsx'
import UnitQuiz from './UnitQuiz.jsx'
import { createCard } from '../lib/srs.js'
import { DECKS } from '../lib/deck.js'

// 구문독해 파트 = 4막 13유닛 커리큘럼.
//
// 유닛은 문법 이름이 아니라 "대사가 하는 일"로 정의하고, 영화의 시간
// 순서와 겹치게 배열했다. 데이터가 만들어진 유닛만 열리고, 나머지는
// 로드맵으로 보여준다 — 전체 그림이 보여야 지금 위치를 안다.

import unitData from '../data/curriculum/units.json'
import vocabData from '../data/curriculum/unit-vocab.json'
import quizData from '../data/curriculum/unit-quiz.json'
import srsData from '../data/curriculum/unit-srs.json'

// 막 이름. 유닛 자체는 데이터에서 읽고, 여기서는 묶음의 이름과 장면만 준다.
const ACTS = {
  1: { title: '1막 — 말 걸기', scene: '기차 · Ch 1–2' },
  2: { title: '2막 — 이야기하기', scene: '도착·다리·전차·레코드점·묘지 · Ch 3–7' },
  3: { title: '3막 — 생각 펼치기', scene: '관람차·카페·교회·시인 · Ch 8–12' },
  4: { title: '4막 — 붙잡기', scene: '오페라·배·와인바·공원·이별 · Ch 16–23' },
}

/** 유닛 SRS 카드 → 기존 카드 스키마. 종류마다 뒷면 재료가 다르다. */
function cardFromUnitSrs(c) {
  const base = {
    id: `card:${c.cardId}`,
    type: 'expression',
    source: { work: 'Before Sunrise', unitId: c.unitId },
    extra: {
      kind: c.kind,
      origin: 'unit-srs',
      unitId: c.unitId,
      deck: 'unit',
      priority: DECKS.unit.priority,
    },
  }
  if (c.kind === 'vocab') {
    return createCard({
      ...base,
      front: c.front,
      back: { meaningKo: c.back.meaningKo, definitionEn: null, nuance: c.back.nuance },
      context: c.back.context ?? null,
    })
  }
  if (c.kind === 'pattern') {
    return createCard({
      ...base,
      front: c.front,
      back: { meaningKo: c.back.pattern, definitionEn: null, nuance: c.back.explanation },
      context: c.back.anchor ?? null,
    })
  }
  // trap — "맞나?" 판정 카드
  return createCard({
    ...base,
    front: c.front,
    back: {
      meaningKo: c.back.verdict === false ? '✗ 틀린 문장' : '⭕ 맞는 문장',
      definitionEn: null,
      nuance: c.back.reason,
    },
    context: null,
  })
}

export default function Curriculum({ cards, commit, curriculum }) {
  // 'list' | 'study' | 'quiz'
  const [screen, setScreen] = useState('list')
  const [openUnitId, setOpenUnitId] = useState(null)

  const units = unitData.units
  const unit = units.find((u) => u.unitId === openUnitId) ?? null
  const progressOf = (id) => curriculum?.unitProgress?.[id] ?? null
  const progress = unit ? progressOf(unit.unitId) : null

  const vocabById = useMemo(
    () => new Map(vocabData.words.map((w) => [w.wordId, w])),
    []
  )

  // 유닛별로 갈라 둔다. 퀴즈와 카드는 그 유닛 것만 나와야 한다.
  const quizzesOf = useMemo(() => {
    const map = new Map()
    for (const q of quizData.quizzes) {
      const list = map.get(q.unitId) ?? []
      list.push(q)
      map.set(q.unitId, list)
    }
    return map
  }, [])

  const cardsOf = useMemo(() => {
    const map = new Map()
    for (const c of srsData.cards) {
      const list = map.get(c.unitId) ?? []
      list.push(c)
      map.set(c.unitId, list)
    }
    return map
  }, [])

  /**
   * 퀴즈 완료: 진행을 저장하고 그 유닛의 SRS 카드를 복습 덱에 넣는다.
   * 카드 투입은 반드시 여기서만 — 퀴즈 전에 열면 안 배운 카드가 복습에
   * 나와 SRS가 망가진다. 재응시해도 카드는 한 번만 들어간다.
   */
  function finishQuiz(score) {
    const unitId = unit.unitId
    // 같은 단어가 여러 유닛에 배정되기도 하고(mannerism은 네 유닛), 이미
    // 하이라이트 카드로 갖고 있는 것도 있다. 앞면이 같은 카드가 덱에 두
    // 장 있으면 복습이 겹쳐서 시간만 먹는다 — 학습지에는 그대로 두되
    // 카드로는 한 번만 넣는다.
    const norm = (t) => (t ?? '').trim().toLowerCase()
    const already = new Set(cards.map((c) => norm(c.front)))

    commit((s) => {
      const existing = new Set(s.cards.map((c) => c.id))
      const fresh = (cardsOf.get(unitId) ?? [])
        .filter((c) => !c.recitationOnly)
        .map(cardFromUnitSrs)
        .filter((c) => !existing.has(c.id))
        .filter((c) => c.kind !== 'vocab' || !already.has(norm(c.front)))
      return {
        ...s,
        cards: [...s.cards, ...fresh],
        curriculum: {
          ...(s.curriculum ?? {}),
          unitProgress: {
            ...(s.curriculum?.unitProgress ?? {}),
            [unitId]: { screen: 'done', completedAt: Date.now(), quizScore: score },
          },
        },
      }
    })
    setScreen('study')
  }

  if (screen === 'study' && unit) {
    return (
      <UnitStudy
        unit={unit}
        vocabById={vocabById}
        progress={progress}
        onBack={() => {
          setScreen('list')
          window.scrollTo({ top: 0 })
        }}
        onStartQuiz={() => {
          setScreen('quiz')
          window.scrollTo({ top: 0 })
        }}
      />
    )
  }

  if (screen === 'quiz' && unit) {
    return (
      <UnitQuiz
        unit={unit}
        quizzes={quizzesOf.get(unit.unitId) ?? []}
        cardCount={(cardsOf.get(unit.unitId) ?? []).filter((c) => !c.recitationOnly).length}
        alreadyDone={progress?.screen === 'done'}
        onExit={() => setScreen('study')}
        onDone={finishQuiz}
      />
    )
  }

  const doneCount = units.filter((u) => progressOf(u.unitId)?.screen === 'done').length
  const byAct = [1, 2, 3, 4].map((act) => ({
    act,
    ...ACTS[act],
    units: units.filter((u) => u.act === act).sort((a, b) => a.order - b.order),
  }))

  return (
    <div className="stack stack--loose">
      <header className="stack stack--tight">
        <h1>구문독해 — 4막 13유닛</h1>
        <p className="hint">
          비포 선라이즈의 대사를 앵커 삼아 영어의 뼈대를 세웁니다. 유닛
          하나 = 앵커 장면 + 규칙 + 어휘 + 퀴즈. 퀴즈를 마치면 그 유닛의
          카드가 복습 덱에 들어갑니다.
        </p>
      </header>

      <div className="tiles">
        <div className="tile tile--accent">
          <div className="tile__value">
            {doneCount}/{units.length}
          </div>
          <div className="tile__label">마친 유닛</div>
        </div>
        <div className="tile">
          <div className="tile__value">{vocabData.words.length}</div>
          <div className="tile__label">배정 어휘</div>
        </div>
        <div className="tile">
          <div className="tile__value">{quizData.quizzes.length}</div>
          <div className="tile__label">문항</div>
        </div>
      </div>

      {byAct.map((a) => (
        <section className="stack" key={a.act}>
          <div className="section-title">{a.title}</div>
          <p className="hint" style={{ marginTop: 'calc(var(--s2) * -1)' }}>
            {a.scene}
          </p>
          {a.units.map((u) => {
            const p = progressOf(u.unitId)
            const done = p?.screen === 'done'
            return (
              <button
                className="panel"
                key={u.unitId}
                onClick={() => {
                  setOpenUnitId(u.unitId)
                  setScreen('study')
                  window.scrollTo({ top: 0 })
                }}
                style={{
                  padding: 'var(--s3) var(--s4)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  font: 'inherit',
                  color: 'inherit',
                  borderColor: done ? 'var(--accent-border)' : undefined,
                }}
              >
                <div className="row row--between">
                  <span className="list__main">
                    <span className="list__title">
                      Unit {u.order} · {u.title}
                    </span>
                    <span className="list__meta">{u.tagline}</span>
                  </span>
                  <span className={`chip${done ? ' chip--accent' : ''}`}>
                    {done ? `${p.quizScore}/20` : '학습하기'}
                  </span>
                </div>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}
