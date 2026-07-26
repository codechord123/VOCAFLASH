import { useEffect } from 'react'
import { STATUS, dictUrl, lookupIn, normalize } from '../lib/words.js'

// 단어를 탭하면 뜨는 하단 시트.
//
// 한 화면에서 세 가지가 다 되어야 읽는 흐름이 안 끊긴다:
// (1) 뜻을 보고 (2) 안다/모른다를 정하고 (3) 단어장에 담는다.
//
// 뜻은 앱이 가진 806개 안에서만 뜬다. 없으면 없다고 말하고 사전 링크와
// 담기를 준다 — 못 하는 것을 숨기면 사용자는 앱이 고장 났다고 생각한다.
// 담아 두면 나중에 뜻을 채워 넣을 수 있다.

const LEVEL_LABELS = { 1: '기초', 2: '중급', 3: '상급', 4: '고급' }

export default function WordPopup({
  word,
  context,
  levels,
  dict,
  entry: presetEntry = null,
  isPhrase = false,
  status,
  isSaved,
  onSetStatus,
  onSave,
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

  // 구문은 이미 찾아서 넘겨준다(화면의 형태와 표의 키가 다를 수 있어서).
  // 단어는 여기서 굴절을 벗겨 가며 찾는다.
  const entry = presetEntry ?? lookupIn(dict, word)
  const level = presetEntry ? 0 : lookupIn(levels, word) ?? 0

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
            <div className="row" style={{ gap: 'var(--s2)', marginTop: 4 }}>
              {isPhrase && (
                <span className="chip chip--accent">
                  {entry?.from === '문법' ? '문법' : '구문'}
                </span>
              )}
              {level > 0 && (
                <span className={`chip${level >= 3 ? ' chip--accent' : ''}`}>
                  {level}급 {LEVEL_LABELS[level]}
                </span>
              )}
              {entry?.from && !isPhrase && <span className="chip">{entry.from}</span>}
              {entry?.ipa && (
                <span className="hint" style={{ fontFamily: 'var(--font-mono)' }}>
                  {entry.ipa}
                </span>
              )}
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>
            닫기
          </button>
        </div>

        {entry ? (
          <div className="stack stack--tight" style={{ marginTop: 'var(--s3)' }}>
            <div className="read" style={{ fontSize: 18 }}>
              {entry.ko}
            </div>
            {entry.en && <p className="hint">{entry.en}</p>}
            {entry.nuance && (
              <p className="hint" style={{ textAlign: 'left' }}>
                뉘앙스 — {entry.nuance}
              </p>
            )}
            {entry.syn?.length > 0 && (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {entry.syn.map((s) => (
                  <span className="chip" key={s}>
                    = {s}
                  </span>
                ))}
              </div>
            )}
            {entry.phr?.length > 0 && (
              <div className="stack stack--tight">
                <div className="hint" style={{ textAlign: 'left' }}>
                  이 단어가 들어간 표현
                </div>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  {entry.phr.map((p) => (
                    <span className="chip chip--box" key={p}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {entry.ctx && (
              <p className="flashcard__context" style={{ marginTop: 'var(--s2)' }}>
                {entry.ctx}
                {entry.who && ` — ${entry.who}`}
                {entry.ch ? `, Ch ${entry.ch}` : ''}
              </p>
            )}
          </div>
        ) : (
          <div className="stack stack--tight" style={{ marginTop: 'var(--s3)' }}>
            <p className="hint" style={{ textAlign: 'left' }}>
              앱 사전에 {isPhrase ? '이 구문' : '이 단어'}의 뜻이 아직
              없습니다. 단어장에 담아 두면 나중에 뜻을 채워 넣을 수 있습니다.
            </p>
            {context && <p className="flashcard__context">{context}</p>}
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

        {/* 상태 — 색을 정하는 것은 결국 본인이다 */}
        <div className="grade-row" style={{ marginTop: 'var(--s4)' }}>
          <button
            className={`btn grade grade--again${status === STATUS.LEARNING ? ' is-active' : ''}`}
            onClick={() =>
              onSetStatus(status === STATUS.LEARNING ? null : STATUS.LEARNING)
            }
          >
            모르는 단어
            <span className="grade__key">굵게 표시</span>
          </button>
          <button
            className={`btn grade grade--good${status === STATUS.KNOWN ? ' is-active' : ''}`}
            onClick={() => onSetStatus(status === STATUS.KNOWN ? null : STATUS.KNOWN)}
          >
            아는 단어
            <span className="grade__key">색 지움</span>
          </button>
        </div>

        <button
          className="btn btn--block"
          style={{ marginTop: 'var(--s2)' }}
          disabled={isSaved}
          onClick={() => onSave(word, context, entry)}
        >
          {isSaved ? '이미 단어장에 있음' : '★ 단어장에 담기'}
        </button>
      </div>
    </>
  )
}

/** 담은 단어를 카드로 만들 재료. 뜻이 없으면 비워 두되 문맥은 남긴다. */
export function cardFieldsFor(word, context, entry) {
  const key = normalize(word) || word
  return {
    id: `card:mark-${key}`,
    front: key,
    back: entry
      ? {
          meaningKo: entry.ko,
          definitionEn: entry.en ?? null,
          nuance: entry.nuance ?? '',
        }
      : null,
    context: entry?.ctx ?? context ?? null,
  }
}
