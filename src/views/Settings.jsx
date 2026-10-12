import { useRef, useState } from 'react'
import { store } from '../lib/store.js'
import { MAX_BOX, BOX_INTERVALS } from '../lib/srs.js'
import { DECKS } from '../lib/deck.js'
import { parseConfig, readConfig, resetCloud, saveConfig, signIn, signOut, syncNow } from '../lib/cloud.js'

// 이 앱의 블록 하나만 '추가'한다. 같은 프로젝트를 쓰는 다른 앱의 규칙은
// 건드리지 않는다 — 경로가 users/{uid}/vocaflash/ 로 좁아서 겹치지 않는다.
const RULES = `    // ───────────────────────────────────────────────
    // [vocaflash] 영어 공부 앱 — 본인 문서만, Google 로그인만
    // ───────────────────────────────────────────────
    match /users/{uid}/vocaflash/{docId} {
      allow read, write: if request.auth != null
        && request.auth.token.firebase.sign_in_provider == 'google.com'
        && request.auth.uid == uid;
    }`

function agoLabel(at) {
  if (!at) return null
  const s = Math.round((Date.now() - at) / 1000)
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}

/** 처음 한 번 — Firestore 규칙에 추가할 블록과 복사 버튼 */
function RulesBlock() {
  const [copied, setCopied] = useState(false)
  return (
    <details className="cloud-steps">
      <summary>처음 한 번 — Firestore 규칙에 이 블록 추가</summary>
      <p className="hint" style={{ textAlign: 'left' }}>
        Firebase 콘솔 → Firestore Database → 규칙. <b>기존 규칙은 그대로 두고</b>, 맨 끝의
        닫는 괄호 두 개 바로 위에 붙여 넣은 뒤 게시하세요. 같은 프로젝트를 쓰는 다른 앱에는
        영향이 없습니다.
      </p>
      <div className="row row--between">
        <span className="label">추가할 블록</span>
        <button
          className="btn btn--sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(RULES)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* 복사가 막힌 브라우저 — 아래 글을 길게 눌러 복사 */
            }
          }}
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <pre className="cloud-rules">{RULES}</pre>
    </details>
  )
}

/**
 * 개인 클라우드. 설정 전에는 붙여 넣는 칸과 안내를, 설정 뒤에는 로그인과
 * 동기화 상태를 보여준다. 한 사람이 한 번만 거치는 화면이라 안내를
 * 화면 안에 다 둔다 — 문서를 따로 찾게 하면 그 자리에서 접는다.
 */
function CloudSection({ cloud }) {
  const cfg = readConfig()
  const [text, setText] = useState('')
  const [err, setErr] = useState(null)
  const [copied, setCopied] = useState(false)

  function saveAndConnect() {
    const parsed = parseConfig(text)
    if (!parsed) {
      setErr('apiKey · projectId · appId를 찾지 못했습니다. firebaseConfig 블록 전체를 붙여 넣으세요.')
      return
    }
    saveConfig(parsed)
    resetCloud()
  }

  async function copyRules() {
    try {
      await navigator.clipboard.writeText(RULES)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 복사가 막힌 브라우저 — 아래 글을 길게 눌러 복사하면 된다 */
    }
  }

  if (!cfg) {
    return (
      <section className="stack">
        <div className="section-title">클라우드 동기화 (Firebase)</div>
        <p className="hint" style={{ textAlign: 'left' }}>
          내 Firebase 프로젝트에 진도를 저장합니다. 브라우저를 지워도, 폰과 노트북을
          오가도 기록이 이어집니다. 한 번만 설정하면 됩니다.
        </p>
        <details className="panel stack stack--tight cloud-steps">
          <summary>설정 방법 (5단계, 약 5분)</summary>
          <ol>
            <li>
              <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer">
                console.firebase.google.com
              </a>
              에서 <b>프로젝트 추가</b> (이름 아무거나, 애널리틱스는 꺼도 됨)
            </li>
            <li>
              <b>Authentication</b> → 시작하기 → 로그인 방법에서 <b>Google</b> 사용 설정 →
              설정 탭의 <b>승인된 도메인</b>에 이 사이트 주소(<code>{location.hostname}</code>) 추가
            </li>
            <li>
              <b>Firestore Database</b> → <b>규칙</b> 탭 → 기존 규칙은 그대로 두고, 마지막 닫는
              괄호 두 개(<code>{'}'}</code> <code>{'}'}</code>) 바로 위에 아래 블록만 추가하고 게시
            </li>
            <li>
              프로젝트 설정(⚙) → 내 앱 → <b>웹 앱(&lt;/&gt;) 추가</b> → 나오는{' '}
              <code>firebaseConfig</code> 블록 전체를 복사
            </li>
            <li>아래 칸에 붙여 넣고 <b>저장하고 연결</b> → Google로 로그인</li>
          </ol>
          <div className="stack stack--tight">
            <div className="row row--between">
              <span className="label">추가할 규칙 블록 — 본인만 읽고 쓰기</span>
              <button className="btn btn--sm" onClick={copyRules}>
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
            <pre className="cloud-rules">{RULES}</pre>
          </div>
        </details>
        <label className="field">
          <span className="label">firebaseConfig 붙여넣기</span>
          <textarea
            className="input input--mono"
            rows={6}
            spellCheck={false}
            placeholder={'const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  projectId: "...",\n  ...\n};'}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setErr(null)
            }}
          />
        </label>
        {err && (
          <div className="notice notice--error">
            <span className="notice__icon">✕</span>
            <span>{err}</span>
          </div>
        )}
        <button className="btn btn--primary" disabled={!text.trim()} onClick={saveAndConnect}>
          저장하고 연결
        </button>
      </section>
    )
  }

  const ago = agoLabel(cloud.lastSyncAt)
  return (
    <section className="stack">
      <div className="section-title">클라우드 동기화 (Firebase)</div>
      <div className="panel stack stack--tight">
        <div className="row row--between">
          <span className="list__main">
            <span className="list__title">
              {cloud.user
                ? cloud.user.email
                : cloud.phase === 'starting'
                  ? '연결하는 중…'
                  : '로그인이 필요합니다'}
            </span>
            <span className="list__meta">
              프로젝트 {cfg.projectId}
              {cloud.phase === 'syncing' && ' · 맞추는 중…'}
              {cloud.phase === 'synced' && ago && ` · 마지막 동기화 ${ago}`}
            </span>
          </span>
          <span className={`cloud-dot cloud-dot--lg is-${cloud.phase}`} aria-hidden="true" />
        </div>
        {cloud.error && (
          <div className="notice notice--error">
            <span className="notice__icon">✕</span>
            <span>{cloud.error}</span>
          </div>
        )}
        <div className="row" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
          {!cloud.user && cloud.phase !== 'starting' && (
            <button className="btn btn--primary" onClick={signIn}>
              Google로 로그인
            </button>
          )}
          {cloud.user && (
            <>
              <button className="btn" onClick={() => syncNow()} disabled={cloud.phase === 'syncing'}>
                지금 동기화
              </button>
              <button className="btn btn--ghost" onClick={signOut}>
                로그아웃
              </button>
            </>
          )}
        </div>
        {!cloud.lastSyncAt && <RulesBlock />}
        <p className="hint" style={{ textAlign: 'left', margin: 0 }}>
          공부하는 동안 몇 초마다, 그리고 앱을 열고 닫을 때 자동으로 맞춥니다.
          두 기기에서 번갈아 공부해도 덮어쓰지 않고 합칩니다 — 더 많이 진행된 쪽이 남습니다.
        </p>
      </div>
      {!cfg.fromEnv && !cfg.builtIn && (
        <button
          className="btn btn--ghost btn--sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            if (!window.confirm('이 기기에서 Firebase 설정을 지울까요? (클라우드의 기록은 그대로 남습니다)')) return
            saveConfig(null)
            resetCloud()
          }}
        >
          Firebase 설정 지우기
        </button>
      )}
    </section>
  )
}

// 설정. 여기서 가장 중요한 건 내보내기다 — localStorage는 브라우저를
// 지우면 날아가고, 그러면 복습 이력 전체가 사라진다. 유일한 백업 수단이라
// 화면 위쪽에 둔다.

export default function Settings({ cards, settings, stats, commit, onReload, onClose, cloud }) {
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null)

  function set(key, value) {
    commit((s) => ({ ...s, settings: { ...s.settings, [key]: value } }))
  }

  const activeDecks = settings.activeDecks ?? {}
  function toggleDeck(id, on) {
    set('activeDecks', { ...activeDecks, [id]: on })
  }

  function download() {
    const blob = new Blob([store.exportAll()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `script-study-backup-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMsg({ kind: 'ok', text: '백업 파일을 저장했습니다.' })
  }

  async function upload(file) {
    try {
      const text = await file.text()
      const r = store.importAll(text, { mode: 'merge' })
      onReload()
      setMsg({
        kind: 'ok',
        // 단어 표시도 같이 복원된다. 숫자로 보여야 백업이 뭘 담고
        // 있었는지 알 수 있다.
        text: `불러왔습니다. 새 카드 ${r.added}개, 갱신 ${r.updated ?? 0}개, 단어 표시 ${r.words ?? 0}개.`,
      })
    } catch (err) {
      setMsg({ kind: 'error', text: `불러오지 못했습니다 — ${err.message}` })
    }
  }

  return (
    <div className="stack stack--loose">
      <div className="row row--between">
        <h1>설정</h1>
        {onClose && (
          <button className="btn btn--ghost btn--sm" onClick={onClose}>
            ← 돌아가기
          </button>
        )}
      </div>

      {msg && (
        <div className={`notice ${msg.kind === 'error' ? 'notice--error' : ''}`}>
          <span className="notice__icon">{msg.kind === 'error' ? '✕' : '✓'}</span>
          <span>{msg.text}</span>
        </div>
      )}

      <CloudSection cloud={cloud ?? { phase: 'off' }} />

      <section className="stack">
        <div className="section-title">백업</div>
        <div className="notice notice--warn">
          <span className="notice__icon">!</span>
          <span>
            카드와 복습 이력은 이 브라우저에만 저장됩니다. 브라우저 데이터를
            지우면 전부 사라지니 주기적으로 내보내 주세요.
          </span>
        </div>
        <div className="row">
          <button className="btn btn--primary" onClick={download}>
            내보내기 (JSON)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            불러오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
              e.target.value = ''
            }}
          />
        </div>
        <p className="hint">
          불러오기는 덮어쓰지 않고 병합합니다. 같은 카드가 있으면 복습이 더
          진행된 쪽을 남깁니다.
        </p>
      </section>

      <section className="stack">
        <div className="section-title">복습할 덱</div>
        <p className="hint">
          꺼둔 덱도 단어장 탭에서는 검색됩니다. 복습 큐에만 안 올라옵니다.
        </p>
        {Object.values(DECKS).map((d) => {
          const n = cards.filter((c) => (c.deck ?? 'highlight') === d.id).length
          // 손댄 적 없는 덱은 덱의 기본값을 따른다 — 복습 큐(App)와 같은
          // 규칙이어야 한다. 예전에는 꺼진 덱(영화 표현)이 여기서만 켜진
          // 것처럼 보였다.
          const on =
            activeDecks[d.id] !== undefined ? activeDecks[d.id] !== false : d.defaultOn !== false
          return (
            <label className="list__item" key={d.id} style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => toggleDeck(d.id, e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
              />
              <span className="list__main">
                <span className="list__title">{d.label}</span>
                <span className="list__meta">{d.hint}</span>
              </span>
              <span className="chip">{n.toLocaleString('ko')}개</span>
            </label>
          )
        })}
      </section>

      <section className="stack">
        <div className="section-title">단어 수준</div>
        <label className="list__item" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.hideBasicWords !== false}
            onChange={(e) => set('hideBasicWords', e.target.checked)}
            style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
          />
          <span className="list__main">
            <span className="list__title">기초 단어 가리기</span>
            <span className="list__meta">
              have, been 같은 초등 수준 단어는 카드에 나오지 않습니다.
              읽다가 구문이 걸려 표시한 자리라 단어 자체는 이미 아는
              것들입니다. 자료에서 지우지는 않습니다.
            </span>
          </span>
        </label>
        <p className="hint" style={{ textAlign: 'left' }}>
          단어 파트에는 단어 한 개짜리 카드만 나옵니다. 노션에서 표시한
          구문·문장 하이라이트는 자료로 남아 있고 읽기 화면에서 볼 수
          있습니다 — 단어와는 외우는 방식이 달라 덱을 나눴습니다.
        </p>
      </section>

      <section className="stack">
        <div className="section-title">복습</div>
        <label className="field">
          <span className="label">하루 복습 상한</span>
          <input
            className="input"
            type="number"
            min="5"
            max="200"
            step="5"
            value={settings.dailyLimit}
            onChange={(e) => set('dailyLimit', Number(e.target.value) || 20)}
          />
          <span className="hint">
            카드가 쌓이면 "오늘 300개"가 떠서 오히려 안 하게 됩니다. 낮은
            박스(모르는 것)부터 이 개수만 올라옵니다.
          </span>
        </label>

        <div className="panel stack stack--tight">
          <h4>박스별 재등장 간격</h4>
          <div className="row" style={{ gap: 'var(--s2)' }}>
            {BOX_INTERVALS.map((d, i) => (
              <span className="chip chip--box" key={i}>
                {i + 1}번 · {d}일
              </span>
            ))}
          </div>
          <p className="hint">
            「알았음」이면 다음 박스로, 「몰랐음」이면 1번으로 돌아갑니다. 노션에서
            손으로 세던 `회독`을 이 방식이 대신합니다.
          </p>
        </div>

        <div className="stack stack--tight">
          <div className="meter-row__label">
            <span>박스 분포</span>
            <span>
              외운 것 {stats.learned} / {stats.total}
            </span>
          </div>
          {stats.byBox.map((n, i) => (
            <div className="meter-row" key={i}>
              <div className="meter-row__label">
                <span>
                  박스 {i + 1} ({BOX_INTERVALS[i]}일)
                </span>
                <span>{n}개</span>
              </div>
              <div className="progress">
                <div
                  className="progress__bar"
                  style={{
                    width: stats.total ? `${(n / stats.total) * 100}%` : '0%',
                    background: i + 1 === MAX_BOX ? 'var(--good)' : 'var(--accent)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <div className="section-title">Claude API (선택)</div>
        <p className="hint">
          해설과 뜻풀이는 이미 만들어져 앱에 들어 있습니다. 이 앱은 평소
          API가 필요 없습니다. 앱 안에서 즉석으로 질문하고 싶을 때만 키를
          넣으세요.
        </p>
        <div className="notice notice--warn">
          <span className="notice__icon">!</span>
          <span>
            키를 넣으면 이 브라우저에 저장됩니다. 공용 PC에서는 넣지 마세요.
          </span>
        </div>
        <label className="field">
          <span className="label">API 키</span>
          <input
            className="input input--mono"
            type="password"
            autoComplete="off"
            placeholder="sk-ant-... (비워두면 사용하지 않음)"
            value={settings.apiKey}
            onChange={(e) => set('apiKey', e.target.value.trim())}
          />
        </label>
        <label className="field">
          <span className="label">모델</span>
          <select
            className="select"
            value={settings.model}
            onChange={(e) => set('model', e.target.value)}
          >
            <option value="claude-sonnet-5">Claude Sonnet 5 (권장)</option>
            <option value="claude-opus-5">Claude Opus 5</option>
            <option value="claude-haiku-4-5">Claude Haiku 4.5 (저렴)</option>
          </select>
        </label>
      </section>

      <section className="stack">
        <div className="section-title">데이터 출처</div>
        <div className="panel stack stack--tight">
          <p className="hint">
            노션 · 50일 프로젝트데일리 — Before Sunrise 24챕터, 하이라이트
          </p>
          <p className="hint">
            Google Sheets — Disenchantment · Before Sunset 문장쌍, 어휘 메모
          </p>
        </div>
      </section>
    </div>
  )
}
