// LingQ식 단어 레이어의 뼈대.
//
// 읽기 화면에서 모든 단어를 클릭 가능하게 만들고, 상태별로 색을 입힌다.
//   known    아는 단어   — 색 없음
//   learning 학습 중     — 앰버 (앱의 강조색과 같은 계열)
//   new      새 단어     — 사전에 뜻이 있는데 아직 손 안 댄 것 (점선)
//   (그 외)  표시 안 함  — 사전에도 없고 손도 안 댄 것. C1 학습자에게
//                          모든 단어를 칠하면 소음이라, 뜻이 있는 것만
//                          신호를 준다.
//
// 상태는 카드와 별개다. 단어를 '안다'고 표시하는 것과 '카드로 저장(북마크)'
// 하는 것은 다른 행동이다. 상태는 자주 바뀌므로 카드(1,100개) 배열을 매번
// 다시 쓰지 않도록 별도 localStorage 키에 둔다.

const WORD_KEY = 'script-study.words.v1'

export const STATUS = {
  NEW: 'new',
  LEARNING: 'learning',
  KNOWN: 'known',
}

// ── 단어 상태 저장소 ────────────────────────────────────────────────

function readStatus() {
  try {
    return JSON.parse(localStorage.getItem(WORD_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeStatus(map) {
  try {
    localStorage.setItem(WORD_KEY, JSON.stringify(map))
  } catch (err) {
    console.error('단어 상태 저장 실패', err)
  }
}

export const wordStore = {
  all: readStatus,
  get(word) {
    return readStatus()[normalize(word)] ?? null
  },
  set(word, status) {
    const map = readStatus()
    const key = normalize(word)
    if (status == null) delete map[key]
    else map[key] = status
    writeStatus(map)
    return map
  },
}

// ── 정규화 ──────────────────────────────────────────────────────────
// 소문자로 낮추고 앞뒤 문장부호를 벗긴다. 축약형의 아포스트로피는
// 살린다(don't, I'm). 곡선 따옴표는 곧은 것으로 통일.

export function normalize(word) {
  return (word ?? '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[^a-z']+|[^a-z']+$/g, '')
}

// ── 사전 조회 ───────────────────────────────────────────────────────
// 사전은 localStorage의 카드에서 만든다 — B2 899개, 하이라이트 144개,
// 메모 54개가 모두 카드이고 항상 로드되어 있어서 따로 받아올 필요가 없다.

/** 카드 배열 → 조회용 사전. 단어형과 표제형(lemma) 양쪽으로 색인. */
export function buildDictionary(cards) {
  const dict = new Map()
  for (const c of cards) {
    if (c.type !== 'expression') continue
    const entry = {
      term: c.front,
      meaningKo: c.back?.meaningKo ?? '',
      definitionEn: c.back?.definitionEn ?? null,
      nuance: c.back?.nuance ?? '',
      phonetics: c.phonetics ?? null,
      synonyms: c.synonyms ?? [],
      antonyms: c.antonyms ?? [],
      example: c.context ?? null,
      exampleKo: c.exampleKo ?? null,
      cardId: c.id,
      source: c.source ?? null,
    }
    for (const key of [normalize(c.front), normalize(c.lemma ?? '')]) {
      if (key && !dict.has(key)) dict.set(key, entry)
    }
  }
  return dict
}

/**
 * 카드로는 넣지 않지만 사전에는 남길 뜻(하이라이트 144개 등)을 합친다.
 * '카드로 복습할 것'과 '읽다가 찾아볼 것'은 다르다 — 구문 조각은 단어
 * 덱에 안 넣되, 그 단어를 탭하면 뜻은 떠야 한다.
 */
export function mergeMeanings(dict, meanings) {
  for (const m of meanings ?? []) {
    const entry = {
      term: m.term,
      meaningKo: m.meaningKo ?? '',
      definitionEn: m.definitionEn ?? null,
      nuance: m.nuance ?? '',
      phonetics: null,
      synonyms: [],
      antonyms: [],
      example: null,
      exampleKo: null,
      cardId: null,
      source: null,
    }
    for (const key of [normalize(m.term), normalize(m.lemma ?? '')]) {
      // 여러 단어짜리(구문)는 단어 탭 조회에 안 걸리므로 건너뛴다.
      if (key && !key.includes(' ') && !dict.has(key)) dict.set(key, entry)
    }
  }
  return dict
}

/**
 * 단어의 뜻을 찾는다. 직접 형태로 못 찾으면 간단한 표제형 축약을 시도한다.
 * 완벽한 형태소 분석은 아니고, 흔한 굴절만 벗겨 본다.
 */
export function lookup(dict, word) {
  const w = normalize(word)
  if (!w) return null
  if (dict.has(w)) return dict.get(w)

  for (const cand of lemmaCandidates(w)) {
    if (dict.has(cand)) return dict.get(cand)
  }
  return null
}

function lemmaCandidates(w) {
  const out = []
  const push = (x) => x.length >= 2 && out.push(x)

  // 복수/3인칭 -s, -es, -ies
  if (w.endsWith('ies')) push(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) push(w.slice(0, -2))
  if (w.endsWith('s')) push(w.slice(0, -1))
  // 과거 -ed, 이중자음
  if (w.endsWith('ied')) push(w.slice(0, -3) + 'y')
  if (w.endsWith('ed')) {
    push(w.slice(0, -2))
    push(w.slice(0, -1))
    if (w.length > 4 && w[w.length - 3] === w[w.length - 4])
      push(w.slice(0, -3))
  }
  // 진행 -ing
  if (w.endsWith('ing')) {
    push(w.slice(0, -3))
    push(w.slice(0, -3) + 'e')
    if (w.length > 5 && w[w.length - 4] === w[w.length - 5])
      push(w.slice(0, -4))
  }
  // 부사 -ly, 비교 -er/-est
  if (w.endsWith('ly')) push(w.slice(0, -2))
  if (w.endsWith('est')) push(w.slice(0, -3))
  if (w.endsWith('er')) push(w.slice(0, -2))
  return out
}

// ── 토큰화 ──────────────────────────────────────────────────────────
// 문장을 단어와 비단어로 쪼갠다. 단어만 클릭 가능하게 하고 나머지는
// 그대로 둔다. 축약형(don't)은 한 단어로 유지.

const TOKEN_RE = /([A-Za-z]+(?:['’][A-Za-z]+)*)/g

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

/** 외부 사전 링크. 자동 뜻이 없는 단어의 마지막 수단. */
export function dictUrl(word) {
  const q = encodeURIComponent(normalize(word))
  return `https://en.dict.naver.com/#/search?query=${q}`
}
