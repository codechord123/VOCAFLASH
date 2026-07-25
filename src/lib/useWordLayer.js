import { createContext, useCallback, useMemo, useState } from 'react'
import { buildDictionary, lookup, mergeMeanings, normalize, wordStore } from './words.js'
import { isBasicToken } from './level.js'
import { createCard } from './srs.js'

// 두 리더가 공유하는 단어 레이어 상태.
//
// 사전 조회, 단어 상태, 팝업 열림, 북마크(카드 생성)를 한군데 모은다.
// 리더는 이 훅이 준 값으로 WordText를 그리고 WordPopup을 띄우기만 한다.

// 읽기 화면 어디서나 단어 레이어에 닿게 하는 컨텍스트. 프롭을 여러 층
// 내려보내지 않으려고 쓴다.
export const WordLayerContext = createContext(null)

export function useWordLayer({ cards, commit, meanings }) {
  const dict = useMemo(
    () => mergeMeanings(buildDictionary(cards), meanings),
    [cards, meanings]
  )
  const [statusMap, setStatusMap] = useState(() => wordStore.all())
  const [selected, setSelected] = useState(null) // { word, context }

  // 이미 카드로 있는 단어 집합. 북마크 중복을 막는다.
  const cardedWords = useMemo(
    () =>
      new Set(
        cards
          .filter((c) => c.type === 'expression')
          .map((c) => normalize(c.front))
      ),
    [cards]
  )

  const openWord = useCallback((word, context) => {
    setSelected({ word, context: context ?? null })
  }, [])

  const closeWord = useCallback(() => setSelected(null), [])

  const setStatus = useCallback((word, status) => {
    const next = wordStore.set(word, status)
    setStatusMap({ ...next })
  }, [])

  /**
   * 단어를 카드로 저장한다. 이미 카드면 아무것도 하지 않는다.
   * 뜻이 없으면 빈 카드로 저장하되 문맥을 담아 둔다 — 나중에 사전에서
   * 찾아 채우면 된다. 저장과 동시에 '학습 중'으로 표시한다.
   */
  const bookmark = useCallback(
    (word, context, entry) => {
      const key = normalize(word)
      if (!key || cardedWords.has(key)) return

      const card = createCard({
        id: `card:mark-${key}-${cards.length}`,
        type: 'expression',
        front: word,
        back: {
          meaningKo: entry?.meaningKo ?? '',
          definitionEn: entry?.definitionEn ?? null,
          nuance: entry?.nuance ?? '',
        },
        context: context ?? entry?.example ?? null,
        source: { work: '읽다가 표시' },
        extra: {
          kind: word.trim().includes(' ') ? 'phrase' : 'word',
          origin: 'reader-bookmark',
          deck: 'note',
          priority: 0,
          phonetics: entry?.phonetics ?? null,
          synonyms: entry?.synonyms ?? [],
          antonyms: entry?.antonyms ?? [],
        },
      })

      commit((s) => ({ ...s, cards: [...s.cards, card] }))
      // 저장한 단어는 학습 중으로. 읽을 때 눈에 띄게.
      setStatus(word, 'learning')
    },
    [cards.length, cardedWords, commit, setStatus]
  )

  return {
    dict,
    statusMap,
    selected,
    openWord,
    closeWord,
    hasBasic: isBasicToken,
    isBookmarked: (word) => cardedWords.has(normalize(word)),
    statusOf: (word) => statusMap[normalize(word)] ?? null,
    setStatus,
    bookmark,
    lookup: (word) => lookup(dict, word),
  }
}
