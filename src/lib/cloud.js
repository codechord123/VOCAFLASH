// 개인 클라우드 — Firebase(구글 로그인 + Firestore 문서 하나).
//
// 저장소의 주인은 여전히 이 브라우저(localStorage)다. 클라우드는 그
// 사본을 한 사람의 계정 아래 두는 일만 한다. 동기화는 언제나 '받아서
// 병합하고 → 병합본을 올리는' 한 경로뿐이다(merge.js). 그래서 폰과
// 노트북에서 번갈아 공부해도 어느 쪽 기록도 덮이지 않는다.
//
// Firebase SDK는 설정이 있을 때만 받는다. 동기화를 안 쓰는 사람은 한
// 바이트도 더 받지 않는다.
//
// 설정은 두 곳에서 읽는다: 빌드 환경변수(VITE_FIREBASE_*) 또는 설정
// 화면에 붙여 넣은 firebaseConfig. 웹용 Firebase 설정은 비밀이 아니다 —
// 데이터를 지키는 것은 Firestore 보안 규칙(본인 uid만)이다.

import { store } from './store.js'

const CONFIG_KEY = 'script-study.firebase'

// 주인의 Firebase 프로젝트(to-do-cal — 앱 세 개가 함께 쓴다). 웹 설정은
// 공개 값이라 앱에 넣어 둔다: 기기마다 붙여 넣을 필요 없이 로그인만 하면
// 된다. 이 앱의 데이터는 users/{uid}/vocaflash/ 아래에만 쓴다 — 같은
// 프로젝트의 다른 앱(to-do-cal, Spider20) 경로와 겹치지 않는다.
const BUILT_IN = {
  apiKey: 'AIzaSyCRajHXD9_KlfvJQb-GtUr8NSk7ce0uad0',
  authDomain: 'to-do-cal-6e835.firebaseapp.com',
  projectId: 'to-do-cal-6e835',
  storageBucket: 'to-do-cal-6e835.firebasestorage.app',
  messagingSenderId: '460218654402',
  appId: '1:460218654402:web:bcb143e419ad0722bee55b',
}
const FIELDS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']
// Firestore 문서 한도는 1MiB. 여유를 두고 자른다.
const DOC_LIMIT = 900_000

/** 콘솔에서 복사한 firebaseConfig 조각(JS 객체든 JSON이든)에서 값을 뽑는다. */
export function parseConfig(text) {
  const out = {}
  for (const f of FIELDS) {
    const m = String(text ?? '').match(new RegExp(`["']?${f}["']?\\s*:\\s*["']([^"']+)["']`))
    if (m) out[f] = m[1].trim()
  }
  return out.apiKey && out.projectId && out.appId ? out : null
}

export function readConfig() {
  const env = import.meta.env ?? {}
  if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
      fromEnv: true,
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null')
    if (saved?.apiKey) return saved
  } catch {
    /* 붙여 넣은 설정이 깨졌으면 내장 설정으로 */
  }
  return { ...BUILT_IN, builtIn: true }
}

export function saveConfig(cfg) {
  try {
    if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
    else localStorage.removeItem(CONFIG_KEY)
  } catch {
    /* 저장 실패는 다음 화면에서 '설정 없음'으로 드러난다 */
  }
}

// ── 상태 — 화면은 구독해서 그린다 ────────────────────────────────────

let status = {
  phase: readConfig() ? 'starting' : 'off', // off | starting | signed-out | syncing | synced | error
  user: null, // { email, uid }
  lastSyncAt: null,
  error: null,
}
const listeners = new Set()

function set(patch) {
  status = { ...status, ...patch }
  for (const fn of listeners) fn(status)
}

export function getStatus() {
  return status
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ── Firebase ─────────────────────────────────────────────────────────

let fb = null // { auth, db, mod }
let onMerged = () => {}

async function boot() {
  if (fb) return fb
  const cfg = readConfig()
  if (!cfg) throw new Error('Firebase 설정이 없습니다')
  const [appMod, authMod, fsMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ])
  const { fromEnv, builtIn, ...config } = cfg
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(config)
  const auth = authMod.getAuth(app)
  const db = fsMod.getFirestore(app)
  fb = { auth, db, authMod, fsMod }
  return fb
}

function docRef() {
  const uid = fb.auth.currentUser?.uid
  if (!uid) throw new Error('로그인이 필요합니다')
  return fb.fsMod.doc(fb.db, 'users', uid, 'vocaflash', 'state')
}

// 이 기기에서 로그인한 적이 있는가. 없으면 앱을 켤 때 Firebase(약 700KB)를
// 받지 않는다 — 로그인 버튼을 누를 때 받는다. 지하철 약한 신호에서 첫
// 화면을 막지 않으려는 것.
const USED_KEY = 'script-study.cloud.used'
function markUsed(on) {
  try {
    if (on) localStorage.setItem(USED_KEY, '1')
    else localStorage.removeItem(USED_KEY)
  } catch {
    /* 표시를 못 남기면 다음에 로그인 버튼을 한 번 더 누르면 된다 */
  }
}
function wasUsed() {
  try {
    return localStorage.getItem(USED_KEY) === '1'
  } catch {
    return false
  }
}

let attached = null

/** Firebase를 받고 로그인 상태를 구독한다. 한 번만. */
function attach() {
  if (attached) return attached
  attached = (async () => {
    const { auth, authMod } = await boot()
    // 리디렉트 로그인(팝업이 막힌 기기)에서 돌아온 경우 결과를 받는다
    authMod.getRedirectResult(auth).catch(() => {})
    authMod.onAuthStateChanged(auth, (u) => {
      if (u) {
        markUsed(true)
        set({ user: { email: u.email, uid: u.uid }, error: null })
        syncNow()
      } else {
        set({ phase: 'signed-out', user: null })
      }
    })
    return fb
  })()
  attached.catch(() => {
    attached = null
  })
  return attached
}

/**
 * 앱이 켜질 때 한 번. 로그인 상태는 Firebase가 기억하므로, 이미 로그인한
 * 기기에서는 화면을 열기만 해도 동기화가 시작된다.
 *
 * @param merged  병합으로 저장본이 바뀌었을 때 화면을 새로 그리는 콜백
 */
let started = false

export async function startCloud(merged) {
  onMerged = merged ?? (() => {})
  if (started) return
  started = true
  const cfg = readConfig()
  if (!cfg) {
    set({ phase: 'off' })
    return
  }
  // 내장 설정이고 이 기기에서 로그인한 적이 없으면 받지 않고 기다린다
  if (cfg.builtIn && !wasUsed()) {
    set({ phase: 'signed-out' })
    return
  }
  try {
    await attach()
  } catch (err) {
    set({ phase: 'error', error: friendly(err) })
  }
}

export async function signIn() {
  try {
    set({ phase: 'starting', error: null })
    const { auth, authMod } = await attach()
    const provider = new authMod.GoogleAuthProvider()
    try {
      await authMod.signInWithPopup(auth, provider)
    } catch (err) {
      // 홈 화면에 추가한 앱 등 팝업이 막히는 곳에서는 리디렉트로
      if (/popup-blocked|operation-not-supported|popup-closed-by-user/.test(err?.code ?? '')) {
        if (err.code === 'auth/popup-closed-by-user') {
          set({ phase: 'signed-out' })
          return
        }
        markUsed(true)
        await authMod.signInWithRedirect(auth, provider)
        return
      }
      throw err
    }
  } catch (err) {
    set({ phase: 'error', error: friendly(err) })
  }
}

export async function signOut() {
  markUsed(false)
  if (!fb) return
  await fb.authMod.signOut(fb.auth)
}

/** 설정을 바꾼 뒤 처음부터 다시 — Firebase 앱은 한 번만 초기화되므로 새로고침이 확실하다 */
export function resetCloud() {
  window.location.reload()
}

// ── 동기화 ───────────────────────────────────────────────────────────

let inFlight = null
let again = false
let timer = null

/** 받아서 병합하고, 병합본을 올린다. 겹쳐 부르면 끝난 뒤 한 번 더 돈다. */
export function syncNow() {
  if (!fb?.auth.currentUser) return Promise.resolve()
  if (inFlight) {
    again = true
    return inFlight
  }
  inFlight = (async () => {
    set({ phase: 'syncing' })
    try {
      const { fsMod } = fb
      const ref = docRef()
      const snap = await fsMod.getDoc(ref)
      let remote = null
      let remoteWords = null
      let remoteWordsAt = null
      if (snap.exists()) {
        const d = snap.data()
        remote = d.state ? JSON.parse(d.state) : null
        remoteWords = d.words ? JSON.parse(d.words) : null
        remoteWordsAt = d.wordsAt ? JSON.parse(d.wordsAt) : null
      }
      const { state, words, wordsAt, changed } = store.mergeRemote(remote, remoteWords, remoteWordsAt)
      if (changed) onMerged(state)
      await fsMod.setDoc(ref, packDoc(state, words, wordsAt))
      set({ phase: 'synced', lastSyncAt: Date.now(), error: null })
    } catch (err) {
      set({ phase: 'error', error: friendly(err) })
    } finally {
      inFlight = null
      if (again) {
        again = false
        syncNow()
      }
    }
  })()
  return inFlight
}

/** 공부하는 동안은 몰아서 — 마지막 변경 후 몇 초 조용하면 올린다 */
export function scheduleSync(ms = 4000) {
  if (!fb?.auth.currentUser) return
  clearTimeout(timer)
  timer = setTimeout(syncNow, ms)
}

const enc = new TextEncoder()
const bytes = (str) => enc.encode(str).length

/**
 * 문서 한 장에 담는다. 넘치면 클라우드 사본에서만 오래된 기록부터 덜어 낸다.
 *
 * 한도는 UTF-8 바이트다 — 한글은 글자당 3바이트라 글자 수로 재면 한도를
 * 넘긴 문서를 올리려다 매번 거절당한다. API 키처럼 기기에만 있어야 하는
 * 값은 빼고 올린다.
 */
export function packDoc(state, words, wordsAt) {
  const { apiKey: _key, ...settings } = state.settings ?? {}
  let s = { ...state, settings }
  const w = JSON.stringify(words ?? {})
  const wa = JSON.stringify(wordsAt ?? {})
  let body = JSON.stringify(s)
  const size = () => bytes(body) + bytes(w) + bytes(wa)
  // 1) 복습 기록을 1/4씩, 최근 200개까지
  while (size() > DOC_LIMIT && (s.reviewLog?.length ?? 0) > 200) {
    s = { ...s, reviewLog: s.reviewLog.slice(Math.floor(s.reviewLog.length / 4)) }
    body = JSON.stringify(s)
  }
  // 2) 그래도 넘치면 말하기 기록, 대사 수집첩 순으로
  if (size() > DOC_LIMIT) {
    s = { ...s, speakLog: (s.speakLog ?? []).slice(-50) }
    body = JSON.stringify(s)
  }
  if (size() > DOC_LIMIT && s.plan?.quotes) {
    s = { ...s, plan: { ...s.plan, quotes: s.plan.quotes.slice(-20) } }
    body = JSON.stringify(s)
  }
  if (size() > DOC_LIMIT) {
    throw new Error(
      `기록이 커서 클라우드 문서 한 장(1MB)에 담기지 않습니다 (${Math.round(size() / 1024)}KB). 설정에서 내보내기로 백업해 두세요.`
    )
  }
  return {
    state: body,
    words: w,
    wordsAt: wa,
    updatedAt: s.updatedAt ?? Date.now(),
    syncedAt: Date.now(),
    device: (navigator.userAgent.match(/\(([^)]+)\)/)?.[1] ?? 'unknown').slice(0, 80),
  }
}

function friendly(err) {
  const code = err?.code ?? ''
  if (code.includes('unauthorized-domain'))
    return '이 주소가 Firebase에 등록되어 있지 않습니다 — Authentication → 설정 → 승인된 도메인에 이 사이트 주소를 추가하세요.'
  if (code.includes('permission-denied'))
    return 'Firestore 규칙이 막고 있습니다 — 설정 화면의 [vocaflash] 블록을 규칙에 추가하고 게시했는지 확인하세요.'
  if (code.includes('api-key') || code.includes('invalid-api-key'))
    return 'Firebase 설정의 apiKey가 맞지 않습니다 — 설정을 다시 붙여 넣으세요.'
  if (code.includes('operation-not-allowed'))
    return 'Google 로그인이 꺼져 있습니다 — Authentication → 로그인 방법에서 Google을 켜세요.'
  if (code.includes('unavailable') || code.includes('network'))
    return '네트워크에 닿지 않습니다. 연결되면 다시 시도합니다.'
  return err?.message ?? String(err)
}
