// 영화 표현 505개를 100일에 나눈다 — 하루 5개, 마지막 날은 남은 것까지.
//
// 장르별로 몰아 두면 한 주 내내 의학 드라마 표현만 나온다. 장르를 돌아가며
// 하나씩 섞어서, 하루치 5개가 대개 다섯 장르에서 하나씩이 되게 한다.
// 소개된 표현은 SRS 카드가 되어 그다음부터는 복습이 데려온다.

export const EXPR_PER_DAY = 5
const TOTAL_DAYS = 100

let cachedOrder = null
let cachedFor = null

/** 장르를 돌아가며 섞은 순서. 결정적이라 같은 날은 늘 같은 5개다. */
export function interleaveByGenre(items) {
  if (cachedFor === items && cachedOrder) return cachedOrder
  const byGenre = new Map()
  for (const e of items) {
    if (!byGenre.has(e.genre)) byGenre.set(e.genre, [])
    byGenre.get(e.genre).push(e)
  }
  const lanes = [...byGenre.values()]
  const out = []
  for (let i = 0; out.length < items.length; i += 1) {
    for (const lane of lanes) if (lane[i]) out.push(lane[i])
  }
  cachedOrder = out
  cachedFor = items
  return out
}

/** N일차에 새로 소개할 표현들 */
export function exprsForDay(items, day) {
  if (!items?.length || day < 1 || day > TOTAL_DAYS) return []
  const order = interleaveByGenre(items)
  const from = (day - 1) * EXPR_PER_DAY
  const to = day === TOTAL_DAYS ? order.length : day * EXPR_PER_DAY
  return order.slice(from, to)
}
