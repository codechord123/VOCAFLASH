// localStorage 영속 계층.
//
// 카드와 복습 이력은 매일 바뀌는 상태다 — 노션은 이걸 잘 못 하고,
// 시트도 못 한다. 그래서 여기가 주인이다. 원문 스크립트는 반대로
// 노션이 주인이고 여기는 읽기 사본만 갖는다.
//
// localStorage는 브라우저를 지우면 날아간다. 그래서 내보내기/불러오기가
// 선택 기능이 아니라 필수다. exportAll()이 유일한 백업 수단이다.

const KEY = 'script-study.v1'

const DEFAULTS = {
  version: 1,
  cards: [],
  settings: {
    apiKey: '',
    model: 'claude-sonnet-5',
    dailyLimit: 20,
    // 복습에 포함할 덱. B2 단어장 899개는 기본으로 꺼둔다 — 첫날 천 개가
    // 밀리면 앱을 안 열게 된다. 단어장 탭에서는 꺼져 있어도 항상 보인다.
    activeDecks: { highlight: true, note: true, b2: false },
  },
  // 어떤 시드를 이미 가져왔는지. 같은 카드를 두 번 넣지 않기 위해.
  importedSeeds: {},
  reviewLog: [], // { at, cardId, grade, boxBefore, boxAfter }
}

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULTS)
    const parsed = JSON.parse(raw)
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
    write(next)
    return next
  },

  /** 전체 백업. localStorage가 날아가는 유일한 대비책. */
  exportAll() {
    const state = read()
    return JSON.stringify(
      { ...state, exportedAt: new Date().toISOString() },
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
      write(next)
      return { added: incoming.cards.length, kept: 0, replaced: true }
    }

    const state = read()
    const byId = new Map(state.cards.map((c) => [c.id, c]))
    let added = 0
    let updated = 0

    for (const card of incoming.cards) {
      const existing = byId.get(card.id)
      if (!existing) {
        byId.set(card.id, card)
        added += 1
      } else if ((card.reviewCount ?? 0) > (existing.reviewCount ?? 0)) {
        byId.set(card.id, card)
        updated += 1
      }
    }

    const next = {
      ...state,
      cards: [...byId.values()],
      reviewLog: [...state.reviewLog, ...(incoming.reviewLog ?? [])],
    }
    write(next)
    return { added, updated, replaced: false }
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
