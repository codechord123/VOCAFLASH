// 듣기 — 기기에 내장된 음성 읽기(Web Speech).
//
// 회화가 목표인데 앱에 소리가 하나도 없었다. 녹음 파일을 싣는 대신 기기의
// 영어 음성을 쓴다: 인터넷 없이 되고(지하철), 비용이 없고, 대사·예문·
// 표현 어느 문장이든 바로 읽을 수 있다. 아이폰의 영어 음성은 이 정도
// 문장 길이에서 충분히 자연스럽다.
//
// 음성 목록은 늦게 실려 오는 브라우저가 있어서(크롬·사파리) 처음 부를 때
// 고르고, 목록이 바뀌면 다시 고른다.

const PREFERRED = [
  // 아이폰·맥의 자연스러운 미국 음성, 그다음 크롬·안드로이드
  /Ava/i, /Samantha/i, /Allison/i, /Susan/i, /Nicky/i, /Zoe/i,
  /Google US English/i, /en-us.*(natural|neural|enhanced|premium)/i,
]

let voice = null

function pickVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const all = window.speechSynthesis.getVoices()
  const en = all.filter((v) => /^en[-_]US/i.test(v.lang))
  const pool = en.length ? en : all.filter((v) => /^en/i.test(v.lang))
  for (const re of PREFERRED) {
    const hit = pool.find((v) => re.test(v.name) || re.test(`${v.lang} ${v.name}`))
    if (hit) return hit
  }
  return pool.find((v) => v.localService) ?? pool[0] ?? null
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    voice = pickVoice()
  })
}

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

/** 무대 지시·말줄임을 걷어 읽을 문장만 남긴다. (Pause, while…) 같은 괄호는 읽지 않는다. */
export function speakable(text) {
  return String(text ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

let current = null

// 읽는 속도 — 설정에서 고른다. 기기에만 둔다(기기마다 음성이 달라서).
const RATE_KEY = 'script-study.tts.rate'
export const RATES = [
  { id: 0.8, label: '천천히' },
  { id: 0.95, label: '보통' },
  { id: 1.1, label: '빠르게' },
]
export function getRate() {
  try {
    const v = Number(localStorage.getItem(RATE_KEY))
    return RATES.some((r) => r.id === v) ? v : 0.95
  } catch {
    return 0.95
  }
}
export function setRate(v) {
  try {
    localStorage.setItem(RATE_KEY, String(v))
  } catch {
    /* 저장 못 하면 이번만 보통 속도 */
  }
}

/**
 * 읽는다. 앞에서 읽던 것은 멈춘다.
 * @returns Promise — 끝까지 읽으면 resolve(true), 끊기면 resolve(false)
 */
export function speak(text, { rate = getRate() } = {}) {
  if (!canSpeak()) return Promise.resolve(false)
  const synth = window.speechSynthesis
  synth.cancel()
  const line = speakable(text)
  if (!line) return Promise.resolve(false)
  if (!voice) voice = pickVoice()
  const u = new SpeechSynthesisUtterance(line)
  u.lang = voice?.lang ?? 'en-US'
  if (voice) u.voice = voice
  u.rate = rate
  current = u
  return new Promise((resolve) => {
    u.onend = () => {
      if (current === u) current = null
      resolve(true)
    }
    u.onerror = () => {
      if (current === u) current = null
      resolve(false)
    }
    synth.speak(u)
  })
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel()
  current = null
}

export function isSpeaking() {
  return Boolean(current)
}
