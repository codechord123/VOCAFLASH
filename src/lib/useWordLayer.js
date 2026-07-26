import { useCallback, useMemo, useState } from 'react'
import { normalize, wordStore } from './words.js'
import { createCard } from './srs.js'
import { DECKS } from './deck.js'
import { cardFieldsFor } from '../views/WordPopup.jsx'

// 두 리더(비포 선라이즈·시트 작품)가 공유하는 단어 레이어 상태.
//
// 리더는 이 훅이 준 값으로 WordText를 그리고 WordPopup을 띄우기만 한다.
// 등급표와 사전은 읽기 자료와 함께 늦게 실려 오므로, 없을 때도 화면이
// 깨지지 않게 빈 객체를 기본값으로 둔다.

export function useWordLayer({ levels, dict, phrases, cards, commit }) {
  const [statusMap, setStatusMap] = useState(() => wordStore.all())
  // { word, context, entry, isPhrase } — 단어든 구문이든 같은 시트로 연다
  const [selected, setSelected] = useState(null)

  const savedWords = useMemo(
    () =>
      new Set(
        cards
          .filter((c) => c.type === 'expression')
          .map((c) => normalize(c.front))
      ),
    [cards]
  )

  const openWord = useCallback((word, context) => {
    setSelected({ word, context: context ?? null, entry: null, isPhrase: false })
  }, [])

  /**
   * 구문을 연다. 사전 조회를 여기서 끝내 두는 이유는, 화면에 보이는
   * 형태(I was going to say)와 표에 있는 키가 다를 수 있어서다.
   */
  const openPhrase = useCallback(
    (key, display, context) => {
      const entry = phrases?.[key] ?? null
      setSelected({ word: display, key, context: context ?? null, entry, isPhrase: true })
    },
    [phrases]
  )

  const closeWord = useCallback(() => setSelected(null), [])

  const setStatus = useCallback((word, status) => {
    setStatusMap({ ...wordStore.set(word, status) })
  }, [])

  /**
   * 단어를 카드로 담는다. 뜻이 없어도 담는다 — 지금 모른다는 사실이
   * 뜻보다 중요한 정보이고, 뜻은 나중에 채우면 된다.
   */
  const save = useCallback(
    (word, context, entry) => {
      const fields = cardFieldsFor(word, context, entry)
      if (savedWords.has(fields.front)) return

      const card = createCard({
        ...fields,
        type: 'expression',
        source: { work: '읽다가 담음' },
        extra: {
          kind: 'word',
          origin: 'reader-bookmark',
          deck: 'note',
          priority: DECKS.note.priority,
        },
      })
      commit((s) => ({ ...s, cards: [...s.cards, card] }))
      // 담은 단어는 '모르는 단어'로 표시해 둔다. 담았다는 건 몰랐다는 뜻이다.
      setStatus(word, 'learning')
    },
    [savedWords, commit, setStatus]
  )

  return {
    levels: levels ?? {},
    dict: dict ?? {},
    phrases: phrases ?? {},
    statusMap,
    selected,
    openWord,
    openPhrase,
    closeWord,
    setStatus,
    save,
    statusOf: (word) => statusMap[normalize(word)] ?? null,
    isSaved: (word) => savedWords.has(normalize(word)),
  }
}
