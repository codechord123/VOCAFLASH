import { memo } from 'react'
import { STATUS, lookupIn, normalize, tokenize } from '../lib/words.js'

// 한 줄을 색이 입혀진 단어들로 그린다.
//
// 색의 규칙은 하나다: **읽다가 멈칫할 만한 곳에만 색이 있다.**
//   3급 상급 · 4급 고급 — 앰버 (읽기 전에 눈에 걸려야 하는 것)
//   2급 중급           — 옅은 파랑 (뜻이 여럿이라 확인해 볼 만한 것)
//   1급 기초·등급 없음  — 색 없음
//
// 그 위에 본인의 표시가 덮어쓴다. 안다고 표시한 단어는 등급이 몇이든
// 색을 지우고, 모른다고 표시한 단어는 굵게 남는다 — 읽을수록 화면이
// 조용해지는 것이 이 색칠의 목적이다.

function WordTextImpl({ text, levels, dict, statusMap, onWord }) {
  const tokens = tokenize(text)

  return (
    <>
      {tokens.map((tok, i) => {
        if (!tok.w) return <span key={i}>{tok.t}</span>

        const key = normalize(tok.t)
        if (!key) return <span key={i}>{tok.t}</span>

        const status = statusMap[key] ?? null
        const level = lookupIn(levels, key) ?? 0
        const hasDef = lookupIn(dict, key) != null

        let cls = 'w'
        if (status === STATUS.KNOWN) cls += ' w--known'
        else if (status === STATUS.LEARNING) cls += ' w--learning'
        else if (level >= 3) cls += ' w--hard'
        else if (level === 2) cls += ' w--mid'
        if (hasDef) cls += ' w--def'

        return (
          <span
            key={i}
            className={cls}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onWord(tok.t, text)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onWord(tok.t, text)
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
