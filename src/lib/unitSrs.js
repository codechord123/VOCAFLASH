// 유닛 SRS — 배운 유닛이 3→7→21일 간격으로 수업에 돌아온다.
//
// 100일 표의 결함은 유닛이 4일 살고 영원히 죽는다는 것이었다. 단어에는
// 간격 복습이 있는데 정작 문법·구문에는 없었다. 여기서는 블록을 마친
// 유닛마다 상태(2~5)와 다음 등판일을 기록하고, 매일 수업 앞머리의
// 누적 복습 슬롯이 due인 유닛에서 문항을 뽑아 되돌린다.
//
//   승급  그날 나온 문항을 전부 맞히면 한 칸 위로, 간격이 넓어진다
//   강등  하나라도 틀리면 한 칸 아래로, 내일 바로 다시 나온다
//
// 달력이 아니라 일차(plan.day) 기준이다 — 하루를 걸러도 간격은 진도를
// 따라오고, 모든 계산이 day 숫자만으로 도는 결정론이라 테스트가 된다.

/** 상태별 다음 등판 간격(일차). 5는 사실상 졸업 — 스팟 체크만 남는다. */
export const UNIT_INTERVALS = { 2: 3, 3: 7, 4: 21, 5: 60 }

export const UNIT_STAGES = {
  2: '새싹', // 블록 직후 — 아직 흔들린다
  3: '자람', // 한 번 살아 돌아왔다
  4: '뿌리', // 3주 뒤에도 남아 있었다
  5: '내 것', // 졸업 — 가끔 스팟 체크
}

/** 표에서 유닛별 블록 마지막 날을 뽑는다. */
export function blockEnds(planDays) {
  const ends = {}
  for (const row of planDays) {
    if (row.unit) ends[row.unit.id] = Math.max(ends[row.unit.id] ?? 0, row.day)
  }
  return ends
}

/** 표에서 유닛 표시 정보(id → {kind, no, title})를 뽑는다. */
export function unitInfoMap(planDays) {
  const map = {}
  for (const row of planDays) {
    if (row.unit && !map[row.unit.id]) map[row.unit.id] = row.unit
  }
  return map
}

/**
 * 마이그레이션 — 이미 블록을 마친 유닛에 상태가 없으면 채워 넣는다.
 * 한꺼번에 여러 유닛이 due가 되면 첫날이 복습 폭탄이 되므로 0·1·2일씩
 * 엇갈려 세운다. 유닛 순서 기반이라 몇 번을 불러도 결과가 같다.
 */
export function ensureUnitSrs(plan, planDays) {
  const ends = blockEnds(planDays)
  const cur = plan.unitSrs ?? {}
  const missing = Object.entries(ends)
    .filter(([id, end]) => end < plan.day && !cur[id])
    .sort((a, b) => a[1] - b[1])
  if (missing.length === 0) return plan
  const next = { ...cur }
  missing.forEach(([id], i) => {
    next[id] = { srs: 2, dueDay: plan.day + (i % 3) }
  })
  return { ...plan, unitSrs: next }
}

/** 블록을 마친 유닛을 복습 궤도에 올린다. completeDay가 부른다. */
export function graduateUnit(unitSrs, unitId, day) {
  if (unitSrs?.[unitId]) return unitSrs
  return { ...(unitSrs ?? {}), [unitId]: { srs: 2, dueDay: day + UNIT_INTERVALS[2] } }
}

/** 오늘 돌아올 차례인 유닛들. 연체가 오래된 것부터. */
export function dueReviewUnits(unitSrs, day) {
  return Object.entries(unitSrs ?? {})
    .filter(([, s]) => s.dueDay <= day)
    .sort((a, b) => a[1].dueDay - b[1].dueDay || (a[0] < b[0] ? -1 : 1))
    .map(([id, s]) => ({ id, ...s }))
}

/** 결정론적 문항 추출 — 같은 날은 항상 같은 문항이라 이어하기가 성립한다. */
export function pickItems(pool, day, unitKey, n) {
  const idx = pool.map((_, i) => i)
  let s = day * 31 + unitKey * 7
  for (let i = idx.length - 1; i > 0; i -= 1) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx.slice(0, Math.min(n, pool.length)).map((i) => pool[i])
}

/**
 * 오늘의 누적 복습 몫을 짠다 — due 상위 두 유닛에서 두 문항씩.
 * 유닛당 두 문항이 승급·강등의 판정 단위다(둘 다 맞아야 승급).
 * due가 하나뿐이면 그 유닛에서 세 문항, 오늘 배우는 유닛은 뺀다.
 *
 * @returns [{unitId, kind, items}] — items는 원본 문항(문법 practice / 구문 quiz)
 */
export function buildReview({ unitSrs, day, excludeUnitId, grammarUnits, quizzes }) {
  const due = dueReviewUnits(unitSrs, day).filter((u) => u.id !== excludeUnitId)
  const picked = due.slice(0, 2)
  const per = picked.length === 1 ? 3 : 2
  const out = []
  for (const u of picked) {
    const numKey = Number(u.id.replace(/\D/g, '')) || 1
    if (u.id.startsWith('g-')) {
      const src = grammarUnits.find((x) => x.id === u.id)
      if (!src) continue
      out.push({ unitId: u.id, kind: 'grammar', src, items: pickItems(src.practice, day, numKey, per) })
    } else {
      const pool = quizzes.filter((q) => q.unitId === u.id)
      const src = { unitId: u.id }
      out.push({ unitId: u.id, kind: 'syntax', src, items: pickItems(pool, day, numKey + 100, per) })
    }
  }
  return out.filter((r) => r.items.length > 0)
}

/**
 * 세션에서 모인 유닛별 복습 결과를 상태에 반영한다.
 * results: { unitId: {right, total} }
 */
export function applyUnitReview(unitSrs, results, day) {
  let next = unitSrs ?? {}
  for (const [id, r] of Object.entries(results ?? {})) {
    const cur = next[id]
    if (!cur || r.total === 0) continue
    const allRight = r.right === r.total
    const srs = allRight ? Math.min(cur.srs + 1, 5) : Math.max(cur.srs - 1, 2)
    const dueDay = allRight ? day + UNIT_INTERVALS[srs] : day + 1
    next = { ...next, [id]: { srs, dueDay } }
  }
  return next
}
