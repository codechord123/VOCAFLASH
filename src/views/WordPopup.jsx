import { useEffect } from 'react'
import { STATUS, dictUrl, lookup, normalize } from '../lib/words.js'

// 단어를 탭하면 뜨는 하단 시트.
//
// LingQ의 핵심 상호작용: 단어 하나에 대해 (1) 뜻을 보고 (2) 상태를 정하고
// (3) 저장한다. 한 화면에서 다 되어야 읽는 흐름이 안 끊긴다.
//
// 자동 뜻은 우리가 가진 사전 안에서만 뜬다. 없으면 상태 표시·북마크·외부
// 사전 링크를 준다 — 못 하는 척 숨기는 것보다 정직하게 대안을 준다.

export default function WordPopup({
  word,
  context,
  dict,
  status,
  onSetStatus,
  onBookmark,
  isBookmarked,
  onClose,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!word) return null
  const entry = lookup(dict, word)
  const key = normalize(word)

  return (
    <>
      <div className="sheet__scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={`${word} 뜻`}>
        <div className="sheet__grip" />

        <div className="row row--between">
          <div>
            <div className="read" style={{ fontSize: 24 }}>
              {word}
            </div>
            {entry?.phonetics && (
              <div className="hint" style={{ fontFamily: 'var(--font-mono)' }}>
                {entry.phonetics}
              </div>
            )}
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>
            닫기
          </button>
        </div>

        {entry ? (
          <div className="stack stack--tight" style={{ marginTop: 'var(--s3)' }}>
            <div className="read" style={{ fontSize: 18 }}>
              {entry.meaningKo}
            </div>
            {entry.definitionEn && <p className="hint">{entry.definitionEn}</p>}
            {entry.nuance && (
              <p className="hint" style={{ textAlign: 'left' }}>
                뉘앙스 — {entry.nuance}
              </p>
            )}
            {(entry.synonyms?.length > 0 || entry.antonyms?.length > 0) && (
              <div className="row">
                {entry.synonyms?.map((w) => (
                  <span className="chip" key={`s-${w}`}>= {w}</span>
                ))}
                {entry.antonyms?.map((w) => (
                  <span className="chip" key={`a-${w}`}>↔ {w}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="stack stack--tight" style={{ marginTop: 'var(--s3)' }}>
            <p className="hint">
              앱 사전에 이 단어의 뜻이 없습니다. 상태만 표시하거나,
              외부 사전에서 찾아볼 수 있습니다.
            </p>
            <a
              className="btn btn--sm"
              style={{ justifySelf: 'start' }}
              href={dictUrl(word)}
              target="_blank"
              rel="noreferrer"
            >
              네이버 사전에서 찾기 ↗
            </a>
          </div>
        )}

        {context && (
          <p
            className="flashcard__context"
            style={{ marginTop: 'var(--s3)' }}
          >
            {context}
          </p>
        )}

        {/* 상태: 세 단계. LingQ의 색 분류를 그대로 조작한다 */}
        <div className="grade-row" style={{ marginTop: 'var(--s4)' }}>
          <button
            className={`btn grade grade--again${status === STATUS.LEARNING ? ' is-active' : ''}`}
            onClick={() => onSetStatus(status === STATUS.LEARNING ? null : STATUS.LEARNING)}
          >
            학습 중
            <span className="grade__key">앰버로 표시</span>
          </button>
          <button
            className={`btn grade grade--good${status === STATUS.KNOWN ? ' is-active' : ''}`}
            onClick={() => onSetStatus(status === STATUS.KNOWN ? null : STATUS.KNOWN)}
          >
            알아요
            <span className="grade__key">색 지움</span>
          </button>
        </div>

        <button
          className="btn btn--block"
          style={{ marginTop: 'var(--s2)' }}
          disabled={isBookmarked}
          onClick={() => onBookmark(word, context, entry)}
        >
          {isBookmarked ? '이미 단어장에 있음' : '★ 단어장에 저장'}
        </button>
      </div>
    </>
  )
}
