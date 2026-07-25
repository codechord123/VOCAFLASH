// B2 단어장 899개의 주제 이름.
//
// words.json에는 Topic_ID가 1~30 숫자로만 들어 있다(각 30단어). 각 묶음의
// 단어를 보면 주제가 명확한데 이름이 없어서 화면에 "1번 주제"로밖에
// 못 띄운다. 주제별로 골라 공부하려면 이름이 있어야 한다.
//
// 이름은 각 묶음의 단어를 보고 정했다. 예:
//   T3  entrepreneur, market, profit, inflation, recession, monopoly → 경제
//   T10 hypothesis, empirical, methodology, quantum, paradigm       → 과학
//   T12 jurisdiction, precedent, plaintiff, verdict, subpoena       → 법률

export const TOPICS = {
  1: { name: '기술', icon: '⚙' },
  2: { name: '환경', icon: '🌿' },
  3: { name: '경제', icon: '📈' },
  4: { name: '문화와 사회', icon: '🌏' },
  5: { name: '건강', icon: '🫀' },
  6: { name: '정치', icon: '🏛' },
  7: { name: '교육', icon: '📚' },
  8: { name: '여행', icon: '✈' },
  9: { name: '예술과 문학', icon: '🎭' },
  10: { name: '과학', icon: '🔬' },
  11: { name: '미디어와 언론', icon: '📰' },
  12: { name: '법률', icon: '⚖' },
  13: { name: '직업과 커리어', icon: '💼' },
  14: { name: '역사와 고고학', icon: '🏺' },
  15: { name: '음식', icon: '🍳' },
  16: { name: '운동', icon: '🏃' },
  17: { name: '심리', icon: '🧠' },
  18: { name: '패션', icon: '👗' },
  19: { name: '개인 재무', icon: '💰' },
  20: { name: '인간관계', icon: '🤝' },
  21: { name: '지리', icon: '🗺' },
  22: { name: '건축과 도시', icon: '🏙' },
  23: { name: '영화와 엔터테인먼트', icon: '🎬' },
  24: { name: '윤리', icon: '🕊' },
  25: { name: '국제 이슈', icon: '🌐' },
  26: { name: '교통과 물류', icon: '🚚' },
  27: { name: '갈등과 외교', icon: '🕊' },
  28: { name: '우주와 천문', icon: '🔭' },
  29: { name: '취미와 여가', icon: '🎨' },
  30: { name: '미래와 예측', icon: '🔮' },
}

/** 카드에서 주제 라벨을 얻는다. B2 덱이 아니면 작품 이름을 쓴다. */
export function topicLabel(card) {
  if (card.topicId && TOPICS[card.topicId]) return TOPICS[card.topicId].name
  return card.source?.work ?? '기타'
}

export function topicIcon(card) {
  if (card.topicId && TOPICS[card.topicId]) return TOPICS[card.topicId].icon
  return '◆'
}
