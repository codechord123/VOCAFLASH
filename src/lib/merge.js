// 두 저장본을 하나로 — 백업 복원과 클라우드 동기화가 함께 쓴다.
//
// 원칙은 하나다: 어느 쪽에서 한 공부도 잃지 않는다. 그래서 덮어쓰지 않고
// 필드마다 '더 많이 진행된 쪽'을 고른다. 복습 진행은 더 많이 본 쪽, 회독은
// 더 많이 읽은 쪽, 일차는 더 멀리 간 쪽, 기록(로그)은 합집합.
//
// 같은 병합을 몇 번 해도 결과가 같아야 한다(멱등). 동기화는 매번 병합을
// 거치므로, 로그를 그냥 이어 붙이면 동기화할 때마다 기록이 두 배가 된다 —
// 예전 불러오기가 실제로 그랬다. 로그는 키로 중복을 걷어 낸다.

function newerOf(a, b) {
  return (b?.updatedAt ?? 0) > (a?.updatedAt ?? 0) ? b : a
}

/** id 합집합. 겹치면 pick이 고른다. */
function unionBy(listA = [], listB = [], key, pick = (a) => a) {
  const map = new Map()
  for (const x of listA) map.set(key(x), x)
  for (const x of listB) {
    const k = key(x)
    map.set(k, map.has(k) ? pick(map.get(k), x) : x)
  }
  return [...map.values()]
}

/** 객체(맵) 병합. 겹치면 pick이 고른다. */
function mergeMap(a = {}, b = {}, pick = (x) => x) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b ?? {})) {
    out[k] = k in out ? pick(out[k], v) : v
  }
  return out
}

/** 복습 진행 — 더 많이 본 쪽, 같으면 더 최근에 본 쪽 */
function pickProgress(a, b) {
  const ra = a?.reviewCount ?? 0
  const rb = b?.reviewCount ?? 0
  if (rb !== ra) return rb > ra ? b : a
  return (b?.lastReviewedAt ?? 0) > (a?.lastReviewedAt ?? 0) ? b : a
}

/**
 * 회독 — 마지막으로 손댄 쪽(읽음·−1 모두 시각을 남긴다). 시각이 없는 예전
 * 기록끼리는 더 많이 읽은 쪽. 예전에는 '많은 쪽'만 봐서, −1로 되돌린
 * 회독이 동기화 4초 뒤 클라우드에서 되살아났다. 속도 기록은 합친다.
 */
function pickRead(a, b) {
  const ua = a?.updatedAt ?? 0
  const ub = b?.updatedAt ?? 0
  const ca = a?.count ?? 0
  const cb = b?.count ?? 0
  const base =
    ua || ub
      ? ub > ua ? b : a
      : cb !== ca ? (cb > ca ? b : a) : (b?.lastAt ?? 0) > (a?.lastAt ?? 0) ? b : a
  const secsLog = unionBy(a?.secsLog, b?.secsLog, (x) => x.at)
    .sort((x, y) => x.at - y.at)
    .slice(-6)
  return secsLog.length ? { ...base, secsLog } : base
}

function pickQuiz(a, b) {
  return (b?.attempts ?? 0) > (a?.attempts ?? 0) ? b : a
}

function pickByAt(field) {
  return (a, b) => ((b?.[field] ?? 0) > (a?.[field] ?? 0) ? b : a)
}

/**
 * 100일 계획. 더 멀리 간 쪽이 뼈대다 — 그쪽의 유닛 궤도·세션이 최신이다.
 * 날짜가 같으면 수업을 더 진행한 쪽.
 */
function mergePlan(a = {}, b = {}) {
  const da = a.day ?? 1
  const db = b.day ?? 1
  let lead = a
  let other = b
  if (db > da || (db === da && (b.session?.idx ?? -1) > (a.session?.idx ?? -1))) {
    lead = b
    other = a
  }
  const sameDay = da === db
  // 진행 중 수업은 앞선 쪽 것만, 그것도 오늘 날짜일 때만. 뒤처진 기기의
  // 지난 수업이 {...other}로 따라 들어와 남아 있던 것을 걷는다.
  const { session: _drop, ...otherRest } = other
  const session = lead.session && lead.session.day === Math.max(da, db) ? lead.session : null
  return {
    ...otherRest,
    ...lead,
    day: Math.max(da, db),
    checks: sameDay ? { ...(other.checks ?? {}), ...(lead.checks ?? {}) } : lead.checks ?? {},
    history: { ...(other.history ?? {}), ...(lead.history ?? {}) },
    // 궤도는 앞선 쪽이 최신이다. 뒤처진 쪽에만 있는 유닛은 살린다.
    unitSrs: { ...(other.unitSrs ?? {}), ...(lead.unitSrs ?? {}) },
    gates: { ...(other.gates ?? {}), ...(lead.gates ?? {}) },
    cando: { ...(other.cando ?? {}), ...(lead.cando ?? {}) },
    quotes: unionBy(other.quotes, lead.quotes, (q) => q.day, (_, y) => y)
      .sort((x, y) => x.day - y.day)
      .slice(-100),
    session: session ?? undefined,
  }
}

/**
 * 두 저장본을 병합한다. a·b 순서는 결과에 영향이 거의 없다 — 설정처럼
 * '진행'으로 비교할 수 없는 것만 updatedAt이 더 최근인 쪽을 따른다.
 */
export function mergeStates(a, b) {
  if (!b) return a
  if (!a) return b
  const newer = newerOf(a, b)
  // 지운 카드의 묘비 — 지운 시각보다 먼저 만들어진 사본은 되살리지 않는다.
  // 같은 카드를 나중에 다시 담으면 만든 시각이 더 늦어서 살아남는다.
  const deleted = mergeMap(a.deleted, b.deleted, (x, y) => Math.max(x, y))
  const alive = (c) => !deleted[c.id] || (c.createdAt ?? 0) > deleted[c.id]
  return {
    ...a,
    ...b,
    version: Math.max(a.version ?? 2, b.version ?? 2),
    updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0),
    // 사용자가 만든 카드 — 합집합. 같은 id는 내용이 같다(내용에서 id를 만든다)
    cards: unionBy(a.cards, b.cards, (c) => c.id).filter(alive),
    deleted,
    progress: mergeMap(a.progress, b.progress, pickProgress),
    reads: mergeMap(a.reads, b.reads, pickRead),
    quizLog: mergeMap(a.quizLog, b.quizLog, pickQuiz),
    curriculum: {
      ...(a.curriculum ?? {}),
      ...(b.curriculum ?? {}),
      unitProgress: mergeMap(
        a.curriculum?.unitProgress,
        b.curriculum?.unitProgress,
        pickByAt('completedAt')
      ),
    },
    grammar: {
      ...(a.grammar ?? {}),
      ...(b.grammar ?? {}),
      unitProgress: mergeMap(a.grammar?.unitProgress, b.grammar?.unitProgress, pickByAt('at')),
    },
    plan: mergePlan(a.plan, b.plan),
    reviewLog: unionBy(a.reviewLog, b.reviewLog, (r) => `${r.at}|${r.cardId}`).sort(
      (x, y) => x.at - y.at
    ),
    speakLog: unionBy(a.speakLog, b.speakLog, (s) => `${s.at}|${s.en}`)
      .sort((x, y) => x.at - y.at)
      .slice(-300),
    importedSeeds: { ...(a.importedSeeds ?? {}), ...(b.importedSeeds ?? {}) },
    // 설정은 진행으로 비교할 수 없다 — 최근에 손댄 쪽
    settings: { ...(newer === a ? b.settings : a.settings), ...(newer.settings ?? {}) },
    lastBackupAt: Math.max(a.lastBackupAt ?? 0, b.lastBackupAt ?? 0) || null,
  }
}

/**
 * 같은 내용인가 — 키 순서와 무관하게. 병합본은 키 순서가 저장본과 달라서
 * 문자열로 비교하면 매번 '바뀌었다'가 되고, 동기화가 화면을 다시 그리고
 * 그게 또 동기화를 부르는 고리가 생긴다.
 */
export function sameState(a, b) {
  return canonical(a) === canonical(b)
}

function canonical(v) {
  return JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
      : x
  )
}

/**
 * 단어 상태(아는/모르는 표시) 병합. 표시마다 시각이 없으므로 저장본
 * 전체가 더 최근인 쪽의 표시를 따르되, 한쪽에만 있는 표시는 살린다.
 */
export function mergeWords(mine = {}, mineAt = {}, theirs = {}, theirsAt = {}, theirsNewer = false) {
  // 단어마다 마지막으로 바꾼 시각이 있으면 그것으로 고른다. 지운 표시도
  // 시각은 남아 있어서(묘비) 다른 쪽의 옛 표시가 되살아나지 않는다.
  // 시각이 없는 예전 표시끼리는 저장본 전체가 더 최근인 쪽을 따른다.
  const keys = new Set([
    ...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(mineAt), ...Object.keys(theirsAt),
  ])
  const words = {}
  const at = {}
  for (const k of keys) {
    const ta = mineAt[k] ?? 0
    const tb = theirsAt[k] ?? 0
    const useTheirs = ta || tb ? tb > ta : theirsNewer ? k in theirs : !(k in mine)
    const v = useTheirs ? theirs[k] : mine[k]
    const t = useTheirs ? tb : ta
    if (v != null) words[k] = v
    if (t) at[k] = t
  }
  return { words, at }
}
