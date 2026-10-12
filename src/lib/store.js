// localStorage 영속 계층.
//
// 카드와 복습 이력은 매일 바뀌는 상태다 — 노션은 이걸 잘 못 하고,
// 시트도 못 한다. 그래서 여기가 주인이다. 원문 스크립트는 반대로
// 노션이 주인이고 여기는 읽기 사본만 갖는다.
//
// localStorage는 브라우저를 지우면 날아간다. 그래서 내보내기/불러오기가
// 선택 기능이 아니라 필수다. exportAll()이 유일한 백업 수단이다.

import { mergeStates, mergeWords, sameState } from './merge.js'

const KEY = 'script-study.v1'
// 단어 상태는 words.js가 이 키로 따로 쓴다. 백업에 같이 담아야 해서
// 여기서도 이름을 안다 — 값을 만지지는 않고 통째로 옮기기만 한다.
const WORD_KEY = 'script-study.words.v1'

function readWordStatus() {
  try {
    return JSON.parse(localStorage.getItem(WORD_KEY) || '{}')
  } catch {
    return {}
  }
}

/** 단어 상태 병합. 이미 표시해 둔 것을 백업이 덮지 않게 현재를 우선한다. */
function mergeWordStatus(incoming) {
  if (!incoming || typeof incoming !== 'object') return 0
  const mine = readWordStatus()
  let added = 0
  for (const [word, status] of Object.entries(incoming)) {
    if (mine[word] === undefined) {
      mine[word] = status
      added += 1
    }
  }
  try {
    localStorage.setItem(WORD_KEY, JSON.stringify(mine))
  } catch (err) {
    console.error('단어 상태 복원 실패', err)
  }
  return added
}

const DEFAULTS = {
  version: 2,
  // 사용자가 만든 카드만 여기 있다 — 읽다가 담은 문장, 유닛을 마치고 열린
  // 카드. 하이라이트·단어장 같은 고정 자료는 앱에 들어 있으므로 저장하지
  // 않는다. 저장본이 가벼워지고, 자료를 손봐도 진행이 흔들리지 않는다.
  cards: [],
  // 복습 진행. { [카드id]: { box, dueAt, reviewCount, lapseCount, lastReviewedAt } }
  progress: {},
  settings: {
    apiKey: '',
    model: 'claude-sonnet-5',
    dailyLimit: 20,
    // 복습에 포함할 덱. B2 단어장 899개는 기본으로 꺼둔다 — 첫날 천 개가
    // 밀리면 앱을 안 열게 된다. 단어장 탭에서는 꺼져 있어도 항상 보인다.
    activeDecks: { highlight: true, note: true, unit: true, line: true, b2: false },
    // have, been 같은 기초 단어는 카드에서 가린다. 읽다가 구문이 걸려
    // 표시한 자리라 단어 자체는 이미 아는 것들이다. 지우지 않고 가린다.
    hideBasicWords: true,
  },
  // 어떤 시드를 이미 가져왔는지. 같은 카드를 두 번 넣지 않기 위해.
  importedSeeds: {},
  reviewLog: [], // { at, cardId, grade, boxBefore, boxAfter }
  // 커리큘럼 진행. { unitProgress: { 'u-07': { screen, completedAt, quizScore } } }
  curriculum: { unitProgress: {} },
  // 회독. { 'before-sunrise-c2': { count, lastAt } } — 목표 20회독
  reads: {},
  // 100일 커리큘럼. day는 끝내야 올라간다 — 달력에 묶지 않는다.
  // unitSrs(유닛 복습 궤도)·gates(관문 성적)·session(진행 중 수업)도 여기 산다.
  plan: { day: 1, checks: {}, history: {} },
  // 말하기 자평 기록. { kind, en, ko, grade, day, at } — 최근 300개
  speakLog: [],
  // 회화 문법 진행. { unitProgress: { 'g-01': { score, total, at } } }
  grammar: { unitProgress: {} },
  // 챕터 퀴즈 기록. { 'before-sunrise-c4': { attempts, best, last, wrong } }
  // 그때뿐인 점수는 약한 자리를 알려주지 못한다. 어디서 틀렸는지 남긴다.
  quizLog: {},
  // 마지막으로 내보내기를 누른 시각. localStorage는 브라우저가 조용히
  // 비우기도 해서, 오래됐으면 앱이 먼저 알려줘야 한다.
  lastBackupAt: null,
}

/**
 * v1 → v2 이행. 카드 안에 섞여 있던 진행을 진행 맵으로 옮기고, 고정
 * 자료에서 온 카드는 저장본에서 뺀다(앱이 다시 만들어 낸다).
 *
 * 진행이 조금이라도 있는 카드만 옮긴다 — 한 번도 안 본 카드까지 옮기면
 * 옮길 것도 없는 항목이 천 개 쌓인다.
 */
function migrate(parsed) {
  if (parsed.version >= 2) return parsed

  const progress = { ...(parsed.progress ?? {}) }
  const kept = []

  for (const card of parsed.cards ?? []) {
    if ((card.reviewCount ?? 0) > 0 || (card.box ?? 1) !== 1) {
      progress[card.id] = {
        box: card.box ?? 1,
        dueAt: card.dueAt ?? 0,
        reviewCount: card.reviewCount ?? 0,
        lapseCount: card.lapseCount ?? 0,
        lastReviewedAt: card.lastReviewedAt ?? null,
      }
    }
    // 앱이 다시 만들어 낼 수 없는 것만 남긴다
    const userMade =
      card.type === 'line' ||
      card.origin === 'reader-bookmark' ||
      card.origin === 'unit-srs'
    if (userMade) kept.push(card)
  }

  return { ...parsed, version: 2, cards: kept, progress }
}

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULTS)
    const parsed = migrate(JSON.parse(raw))
    // 필드가 추가돼도 기존 저장본이 깨지지 않게 얕은 병합.
    return {
      ...structuredClone(DEFAULTS),
      ...parsed,
      settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
    }
  } catch (err) {
    console.error('저장본을 읽지 못했습니다. 기본값으로 시작합니다.', err)
    return structuredClone(DEFAULTS)
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return { ok: true }
  } catch (err) {
    // 용량 초과가 현실적인 실패다(카드 수천 개 + 문맥 문장).
    // 조용히 삼키면 사용자가 복습 기록을 잃고도 모른다.
    console.error('저장에 실패했습니다.', err)
    return { ok: false, error: err }
  }
}

export const store = {
  load: read,

  save(state) {
    return write(state)
  },

  update(mutator) {
    const state = read()
    const next = mutator(state) ?? state
    // 언제 바뀌었는지 — 동기화가 설정처럼 '진행'으로 비교할 수 없는 값을
    // 고를 때 이 시각을 본다
    if (next !== state) next.updatedAt = Date.now()
    write(next)
    return next
  },

  /** 단어 상태(별도 키) — 동기화가 통째로 옮긴다 */
  readWords: readWordStatus,
  writeWords(words) {
    try {
      localStorage.setItem(WORD_KEY, JSON.stringify(words ?? {}))
    } catch (err) {
      console.error('단어 상태 저장 실패', err)
    }
  },

  /**
   * 전체 백업. localStorage가 날아가는 유일한 대비책.
   *
   * 단어 상태(아는/모르는 표시)는 다른 키에 따로 저장된다. 그걸 빼놓고
   * 내보내면, 정작 백업이 필요한 날 읽기 화면의 색이 통째로 사라진다 —
   * 유일한 대비책이 절반만 대비하고 있었다.
   */
  exportAll() {
    const state = read()
    const at = Date.now()
    // 내보낸 시각을 남겨야 "언제 백업했는지"를 앱이 말해줄 수 있다.
    write({ ...state, lastBackupAt: at })
    return JSON.stringify(
      {
        ...state,
        lastBackupAt: at,
        wordStatus: readWordStatus(),
        exportedAt: new Date(at).toISOString(),
      },
      null,
      2
    )
  },

  /**
   * 백업 복원. 기본은 병합(merge) — 덮어쓰기를 기본으로 두면
   * 실수로 현재 진도를 날린다. id가 겹치면 복습이 더 진행된 쪽을 남긴다.
   */
  importAll(json, { mode = 'merge' } = {}) {
    const incoming = JSON.parse(json)
    if (!Array.isArray(incoming.cards)) {
      throw new Error('카드 배열이 없는 파일입니다.')
    }

    if (mode === 'replace') {
      const next = { ...structuredClone(DEFAULTS), ...incoming }
      delete next.wordStatus // 본체 상태가 아니라 따로 저장되는 값이다
      write(next)
      mergeWordStatus(incoming.wordStatus)
      return { added: incoming.cards.length, kept: 0, replaced: true }
    }

    // 병합은 동기화와 같은 함수를 쓴다(merge.js). 예전에는 여기서 로그를
    // 그냥 이어 붙여서, 같은 백업을 두 번 불러오면 복습 기록이 두 배가 됐다.
    const state = read()
    const incomingState = { ...structuredClone(DEFAULTS), ...migrate(incoming) }
    delete incomingState.wordStatus
    delete incomingState.exportedAt
    const before = new Set(state.cards.map((c) => c.id))
    const next = mergeStates(state, incomingState)
    write(next)
    const added = next.cards.filter((c) => !before.has(c.id)).length
    const updated = Object.entries(next.progress).filter(
      ([id, p]) => p !== state.progress?.[id]
    ).length
    const words = mergeWordStatus(incoming.wordStatus)
    return { added, updated, words, replaced: false }
  },

  /**
   * 클라우드에서 받은 저장본을 지금 것과 병합해 저장한다.
   * 바뀐 것이 있으면 병합본을, 없으면 null을 돌려준다.
   */
  mergeRemote(remote, remoteWords) {
    const state = read()
    const remoteState = remote ? { ...structuredClone(DEFAULTS), ...migrate(remote) } : null
    const next = remoteState ? mergeStates(state, remoteState) : state
    const remoteNewer = (remote?.updatedAt ?? 0) > (state.updatedAt ?? 0)
    const words = mergeWords(readWordStatus(), remoteWords ?? {}, remoteNewer)
    const changed = !sameState(next, state) || !sameState(words, readWordStatus())
    if (changed) {
      write(next)
      store.writeWords(words)
    }
    return { state: next, words, changed }
  },

  /** 시드를 한 번만 가져오기 위한 표시. */
  hasSeed(seedId) {
    return Boolean(read().importedSeeds[seedId])
  },

  markSeed(seedId, count) {
    return store.update((state) => ({
      ...state,
      importedSeeds: {
        ...state.importedSeeds,
        [seedId]: { at: Date.now(), count },
      },
    }))
  },
}
