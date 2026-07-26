// 읽기 화면의 단어 레이어.
//
// 랭귀지 리액터처럼, 대본의 모든 단어에 난이도 색을 입히고 탭하면 뜻을
// 띄운다. 두 자료가 각각 다른 일을 한다:
//
//   word-levels (3,147개)  난이도 1~4 — 색을 칠하는 근거. 뜻이 없어도 등급은 있다.
//   word-dict   (806개)    뜻·뉘앙스·대본 문맥·관련 구문 — 탭했을 때 보여줄 것.
//
// 등급이 사전보다 네 배 많은 게 핵심이다. 뜻을 다 적지 않아도 "이 단어가
// 어려운가"는 말할 수 있고, 색은 그것만 있으면 된다. 뜻이 없는 단어는
// 탭했을 때 정직하게 없다고 말하고 사전 링크와 담기를 준다.

const WORD_KEY = 'script-study.words.v1'

export const STATUS = {
  LEARNING: 'learning', // 모르는 단어로 표시 — 앰버로 도드라진다
  KNOWN: 'known', // 아는 단어로 표시 — 색을 지운다
}

// ── 단어 상태 저장소 ────────────────────────────────────────────────
// 카드와 별개다. '안다고 표시'와 '단어장에 담기'는 다른 행동이고,
// 상태는 자주 바뀌므로 카드 배열과 섞지 않는다.

function readStatus() {
  try {
    return JSON.parse(localStorage.getItem(WORD_KEY) || '{}')
  } catch {
    return {}
  }
}

export const wordStore = {
  all: readStatus,
  set(word, status) {
    const map = readStatus()
    const key = normalize(word)
    if (status == null) delete map[key]
    else map[key] = status
    try {
      localStorage.setItem(WORD_KEY, JSON.stringify(map))
    } catch (err) {
      console.error('단어 상태 저장 실패', err)
    }
    return map
  },
}

// ── 정규화·토큰화 ───────────────────────────────────────────────────

/** 소문자로 낮추고 앞뒤 문장부호를 벗긴다. 축약형의 아포스트로피는 살린다. */
export function normalize(word) {
  return (word ?? '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[^a-z']+|[^a-z']+$/g, '')
}

const TOKEN_RE = /([A-Za-z]+(?:['’][A-Za-z]+)*)/g

/** 문장을 단어와 비단어로 쪼갠다. 축약형(don't)은 한 단어로 유지. */
export function tokenize(text) {
  const tokens = []
  let last = 0
  let m
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(text))) {
    if (m.index > last) tokens.push({ w: false, t: text.slice(last, m.index) })
    tokens.push({ w: true, t: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) tokens.push({ w: false, t: text.slice(last) })
  return tokens
}

/**
 * 굴절을 벗겨 표제형 후보를 만든다.
 *
 * 완전한 형태소 분석이 아니라 흔한 어미만 벗겨 본다. 대본은 구어라
 * 규칙 변화가 대부분이고, 여기서 몇 개 놓쳐도 색이 안 칠해질 뿐이다.
 */
export function lemmaCandidates(w) {
  const out = []
  const push = (x) => x.length >= 2 && out.push(x)

  if (w.endsWith("n't")) push(w.slice(0, -3))
  if (w.includes("'")) push(w.split("'")[0])
  if (w.endsWith('ies')) push(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) push(w.slice(0, -2))
  if (w.endsWith('s')) push(w.slice(0, -1))
  if (w.endsWith('ied')) push(w.slice(0, -3) + 'y')
  if (w.endsWith('ed')) {
    push(w.slice(0, -2))
    push(w.slice(0, -1))
    if (w.length > 4 && w[w.length - 3] === w[w.length - 4]) push(w.slice(0, -3))
  }
  if (w.endsWith('ing')) {
    push(w.slice(0, -3))
    push(w.slice(0, -3) + 'e')
    if (w.length > 5 && w[w.length - 4] === w[w.length - 5]) push(w.slice(0, -4))
  }
  if (w.endsWith('ly')) push(w.slice(0, -2))
  if (w.endsWith('est')) push(w.slice(0, -3))
  if (w.endsWith('er')) push(w.slice(0, -2))
  return out
}

/** 표에서 단어를 찾는다. 직접 형태로 없으면 표제형 후보를 시도한다. */
export function lookupIn(table, word) {
  const w = normalize(word)
  if (!w || !table) return null
  if (table[w] !== undefined) return table[w]
  for (const cand of lemmaCandidates(w)) {
    if (table[cand] !== undefined) return table[cand]
  }
  return null
}

/**
 * 그 단어가 들어 있는 문장 하나만 잘라낸다.
 *
 * 대사 한 줄이 곧 한 문장인 것은 아니다. 제시의 케이블 방송 이야기처럼
 * 한 줄이 열 문장짜리 독백일 때, 줄 전체를 문맥이라고 보여주면 단어는
 * 안 보이고 벽만 보인다. 필요한 것은 그 단어가 선 자리 한 문장이다.
 */
export function sentenceAround(text, word) {
  if (!text) return null
  const key = normalize(word)
  if (!key) return text

  const sentences = text.split(/(?<=[.!?…])\s+/)
  const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
  const hit = sentences.find((s) => re.test(s))
  const picked = (hit ?? sentences[0] ?? text).trim()

  // 그래도 길면 앞뒤를 잘라 낸다. 문맥은 한 호흡이면 충분하다.
  if (picked.length <= 180) return picked
  const at = picked.search(re)
  const from = Math.max(0, at - 70)
  return (from > 0 ? '…' : '') + picked.slice(from, from + 180).trim() + '…'
}

/** 외부 사전 링크. 앱에 뜻이 없는 단어의 마지막 수단. */
export function dictUrl(word) {
  return `https://en.dict.naver.com/#/search?query=${encodeURIComponent(normalize(word))}`
}
