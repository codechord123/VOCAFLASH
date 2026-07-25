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

// 아직 데이터가 없는 유닛의 자리. 제목은 기획 확정본.
const ROADMAP = [
  {
    act: 1,
    title: '1막 — 말 걸기',
    scene: '기차 · Ch 1–2',
    units: [
      { order: 1, title: '생략 의문문 + 문미 부가' },
      { order: 2, title: '담화표지와 축약' },
      { order: 3, title: '얼버무림·완충' },
    ],
  },
  {
    act: 2,
    title: '2막 — 이야기하기',
    scene: '도착·다리·전차·레코드점·묘지 · Ch 3–7',
    units: [
      { order: 4, title: '현재완료 경험·계속' },
      { order: 5, title: '현재완료진행' },
      { order: 6, title: '과거완료' },
      { order: 7, title: 'would의 반복 용법' },
      { order: 8, title: '비교 구문' },
    ],
  },
  {
    act: 3,
    title: '3막 — 생각 펼치기',
    scene: '관람차·카페·교회·시인 · Ch 8–12',
    units: [
      { order: 9, title: '강조·도치' },
      { order: 10, title: '명사절·관계사 확장' },
      { order: 11, title: '지각동사 + -ing' },
    ],
  },
  {
    act: 4,
    title: '4막 — 붙잡기',
    scene: '오페라·배·와인바·공원·이별 · Ch 16–23',
    units: [
      { order: 12, title: '가정법 (과거/과거완료/혼합)' },
      { order: 13, title: 'wish + 과거완료 / 후회' },
    ],
  },
]

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

export default function Curriculum({ commit, curriculum }) {
  // 'list' | 'study' | 'quiz'
  const [screen, setScreen] = useState('list')

  const unit = unitData.units[0] // 지금은 u-07 하나
  const progress = curriculum?.unitProgress?.[unit.unitId] ?? null

  const vocabById = useMemo(
    () => new Map(vocabData.words.map((w) => [w.wordId, w])),
    []
  )

  /**
   * 퀴즈 완료: 진행 상태를 저장하고, 이 유닛의 SRS 카드를 복습 덱에
   * 넣는다. 카드 투입은 반드시 여기서만 — 퀴즈 전에 열면 안 배운
   * 카드가 복습에 나와 SRS가 망가진다. 재응시해도 카드는 한 번만.
   */
  function finishQuiz(score) {
    commit((s) => {
      const existing = new Set(s.cards.map((c) => c.id))
      const fresh = srsData.cards
        .filter((c) => !c.recitationOnly)
        .map(cardFromUnitSrs)
        .filter((c) => !existing.has(c.id))
      return {
        ...s,
        cards: [...s.cards, ...fresh],
        curriculum: {
          ...(s.curriculum ?? {}),
          unitProgress: {
            ...(s.curriculum?.unitProgress ?? {}),
            [unit.unitId]: {
              screen: 'done',
              completedAt: Date.now(),
              quizScore: score,
            },
          },
        },
      }
    })
    setScreen('study')
  }

  if (screen === 'study') {
    return (
      <UnitStudy
        unit={unit}
        vocabById={vocabById}
        progress={progress}
        onBack={() => setScreen('list')}
        onStartQuiz={() => setScreen('quiz')}
      />
    )
  }

  if (screen === 'quiz') {
    return (
      <UnitQuiz
        unit={unit}
        quizzes={quizData.quizzes}
        cardCount={srsData.cards.filter((c) => !c.recitationOnly).length}
        alreadyDone={progress?.screen === 'done'}
        onExit={() => setScreen('study')}
        onDone={finishQuiz}
      />
    )
  }

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

      {ROADMAP.map((act) => (
        <section className="stack" key={act.act}>
          <div className="section-title">{act.title}</div>
          <p className="hint" style={{ marginTop: 'calc(var(--s2) * -1)' }}>
            {act.scene}
          </p>
          {act.units.map((u) => {
            const live = unit.order === u.order ? unit : null
            const done = live && progress?.screen === 'done'
            if (!live) {
              return (
                <div
                  className="panel"
                  key={u.order}
                  style={{ padding: 'var(--s3) var(--s4)', opacity: 0.45 }}
                >
                  <div className="row row--between">
                    <span className="list__main">
                      <span className="list__title">
                        Unit {u.order} · {u.title}
                      </span>
                    </span>
                    <span className="chip">예정</span>
                  </div>
                </div>
              )
            }
            return (
              <button
                className="panel"
                key={u.order}
                onClick={() => setScreen('study')}
                style={{
                  padding: 'var(--s3) var(--s4)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  font: 'inherit',
                  color: 'inherit',
                  borderColor: 'var(--accent-border)',
                  background: 'var(--accent-soft)',
                }}
              >
                <div className="row row--between">
                  <span className="list__main">
                    <span className="list__title">
                      Unit {live.order} · {live.title}
                    </span>
                    <span className="list__meta">{live.tagline}</span>
                  </span>
                  <span className={`chip${done ? ' chip--box' : ''}`}>
                    {done ? `완료 · ${progress.quizScore}/20` : '학습하기'}
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
