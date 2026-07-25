import { memo } from 'react'
import { STATUS, normalize, tokenize } from '../lib/words.js'

// 한 줄의 텍스트를 클릭 가능한 단어들로 그린다.
//
// 상태 색은 절제해서 쓴다. 아는 단어에 색을 칠하면 소음이라, 학습 중인
// 것만 앰버로 채우고 '뜻이 있는 새 단어'는 점선으로만 신호를 준다.
// 기초 단어(the, and…)는 색도 클릭도 없다 — 눌러봐야 얻을 게 없다.

function WordTextImpl({ text, dict, statusMap, hasBasic, onWord }) {
  const tokens = tokenize(text)
  return (
    <>
      {tokens.map((tok, i) => {
        if (!tok.w) return <span key={i}>{tok.t}</span>

        const key = normalize(tok.t)
        if (!key || (hasBasic && hasBasic(key))) {
          return <span key={i}>{tok.t}</span>
        }

        const status = statusMap[key] ?? null
        const known = status === STATUS.KNOWN
        const learning = status === STATUS.LEARNING
        // 사전에 뜻이 있는 미표시 단어만 '새 단어'로 신호. 나머지는 평범.
        const hasDef = dict.has(key)
        const isNew = !status && hasDef

        let cls = 'w'
        if (learning) cls += ' w--learning'
        else if (isNew) cls += ' w--new'
        else if (known) cls += ' w--known'

        return (
          <span
            key={i}
            className={cls}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onWord(tok.t, e)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onWord(tok.t, e)
              }
            }}
          >
            {tok.t}
          </span>
        )
      })}
    </>
  )
}

export const WordText = memo(WordTextImpl)
