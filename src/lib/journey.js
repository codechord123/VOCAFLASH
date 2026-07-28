// 비엔나의 밤 — 100일을 영화의 하룻밤으로 걷는다.
//
// 이 앱의 재미는 배지나 보석이 아니라 영화 그 자체다. 10개 사이클을
// Jesse와 Céline이 지나간 밤의 정거장에 붙인다. 3사이클을 지나는 중이면
// 당신은 지금 레코드 가게 청음실에 서 있는 것이다.

// tint: 그 정거장의 빛. 사이클이 바뀌면 앱의 강조색이 이 색으로 흐른다 —
// 기차의 앰버에서 노을, 밤, 새벽을 지나 여명까지. 100일 동안 같은 화면을
// 두 번 보지 않는다.
export const NIGHT_STOPS = [
  { cycle: 1, place: '기차 안', note: '낯선 사람에게 처음 말을 붙인다', tint: '#e8a33d' },
  { cycle: 2, place: '트램과 다리', note: '비엔나에 내려 걷기 시작한다', tint: '#e0904a' },
  { cycle: 3, place: '레코드 가게', note: '청음실, 눈을 어디에 둘지 모르는', tint: '#d4796b' },
  { cycle: 4, place: '묘지와 골목', note: '죽음과 시간 이야기', tint: '#a3a578' },
  { cycle: 5, place: '프라터 관람차', note: '해 지는 관람차 위', tint: '#e06e5a' },
  { cycle: 6, place: '카페', note: '전화 놀이 — 서로를 제3자로 말하기', tint: '#c08d55' },
  { cycle: 7, place: '밤거리와 시인', note: '즉흥시를 받아 드는 강가', tint: '#6fa8a0' },
  { cycle: 8, place: '성당과 강가', note: '밤이 깊어지고 말도 깊어진다', tint: '#9d8ec9' },
  { cycle: 9, place: '공원의 새벽', note: '와인과 잔디, 시간이 없다는 것', tint: '#7ba7d4' },
  { cycle: 10, place: '기차역, 해 뜨기 전', note: '헤어짐 — 그리고 약속', tint: '#d98a9b' },
]

/** 사이클의 빛을 CSS 변수로 — 오늘 탭 안에서만 강조색이 물든다. */
export function nightTint(cycle) {
  const hex = NIGHT_STOPS[cycle - 1]?.tint ?? NIGHT_STOPS[0].tint
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return {
    '--accent': hex,
    '--accent-soft': `rgba(${r}, ${g}, ${b}, 0.14)`,
    '--accent-border': `rgba(${r}, ${g}, ${b}, 0.4)`,
  }
}

/** 오늘 수업의 등급 — 점수를 밤의 언어로 바꾼다. */
export function sessionGrade(acc, bestCombo = 0) {
  if (acc === null) return null
  if (acc === 100) return { title: '완벽한 밤', line: '한 문장도 놓치지 않았습니다. Céline도 감탄할 밤.' }
  if (acc >= 90) return { title: '거의 완벽한 밤', line: '몇 걸음 비틀거렸지만, 밤은 당신 편이었습니다.' }
  if (acc >= 75) return { title: '좋은 밤', line: '이 정도면 비엔나를 걸을 자격이 있습니다.' }
  if (acc >= 60) return { title: '밤은 아직 길다', line: '틀린 자리는 내일 아침 카드로 돌아옵니다 — 그게 이 앱의 방식.' }
  return { title: '흔들린 밤', line: '괜찮습니다. 틀린 만큼 내일이 두꺼워집니다.' }
}
