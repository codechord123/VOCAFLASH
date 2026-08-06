// 한→영 문장 카드의 뼈대 힌트.
//
// 오답 배열·말하기 🔴에서 온 카드는 앞면이 한국어 문장이고 뒷면이 영어
// 문장이다. 힌트 없이 "통번역하라"는 과제는 플래시카드에 안 맞는 무게다 —
// 카드 한 장의 회상 목표는 하나여야 하고, 몇 초 안에 시도가 가능해야 한다.
//
// 그래서 앞면에 문장의 첫 글자 뼈대를 함께 보여준다. 과제가 '백지 번역'
// 에서 '뼈대 채우기(단서 회상)'로 바뀐다 — 섀도잉 2단계와 같은 원리다.

/** 단어의 첫 글자만 남기고 가린다. */
export function firstLetters(en) {
  return en
    .split(' ')
    .map((w) => {
      const m = w.match(/[A-Za-z]/)
      if (!m) return w
      const i = w.indexOf(m[0])
      return w.slice(0, i + 1) + w.slice(i + 1).replace(/[A-Za-z]/g, '_')
    })
    .join(' ')
}

const HANGUL = /[가-힣]/

/**
 * 한→영 문장 생산 카드인가? 그렇다면 앞면에 붙일 뼈대를 돌려준다.
 * (앞면에 한글이 있고, 뒷면 뜻이 3단어 이상의 영어 문장일 때)
 */
export function koToEnClue(card) {
  const en = card?.back?.meaningKo
  if (!en || !HANGUL.test(card?.front ?? '')) return null
  if (HANGUL.test(en)) return null
  if (en.trim().split(/\s+/).length < 3) return null
  return firstLetters(en)
}
