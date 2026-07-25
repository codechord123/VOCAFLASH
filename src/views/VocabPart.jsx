import { useState } from 'react'
import Today from './Today.jsx'
import Vocab from './Vocab.jsx'

// 단어 파트. 복습(오늘 볼 카드)과 목록(전체 검색)을 한 파트 안에 둔다.
//
// 상단 탭을 3개로 유지하기 위한 묶음이기도 하지만, 순서에도 의도가
// 있다. 매일 여는 것은 '복습'이고 '목록'은 찾아볼 때만 쓴다. 그래서
// 복습이 기본 화면이다.

const SUB = [
  { id: 'review', label: '복습' },
  { id: 'list', label: '목록' },
]

export default function VocabPart({ cards, reviewCards, stats, settings, commit }) {
  const [sub, setSub] = useState('review')

  return (
    <div className="stack stack--loose">
      <nav className="subtabs" role="tablist" aria-label="단어 파트 화면">
        {SUB.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={sub === s.id}
            className="tab"
            onClick={() => setSub(s.id)}
          >
            {s.label}
            {s.id === 'list' && (
              <span className="tab__count">{cards.length.toLocaleString('ko')}</span>
            )}
          </button>
        ))}
      </nav>

      {sub === 'review' && (
        <Today
          cards={reviewCards}
          stats={stats}
          settings={settings}
          commit={commit}
          onGoTo={() => setSub('list')}
        />
      )}
      {sub === 'list' && <Vocab cards={cards} commit={commit} />}
    </div>
  )
}
