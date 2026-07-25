import { useRef, useState } from 'react'
import { store } from '../lib/store.js'
import { MAX_BOX, BOX_INTERVALS } from '../lib/srs.js'
import { DECKS } from '../lib/deck.js'

// 설정. 여기서 가장 중요한 건 내보내기다 — localStorage는 브라우저를
// 지우면 날아가고, 그러면 복습 이력 전체가 사라진다. 유일한 백업 수단이라
// 화면 위쪽에 둔다.

export default function Settings({ cards, settings, stats, commit, onReload }) {
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
        text: `불러왔습니다. 새 카드 ${r.added}개, 갱신 ${r.updated ?? 0}개.`,
      })
    } catch (err) {
      setMsg({ kind: 'error', text: `불러오지 못했습니다 — ${err.message}` })
    }
  }

  return (
    <div className="stack stack--loose">
      <h1>설정</h1>

      {msg && (
        <div className={`notice ${msg.kind === 'error' ? 'notice--error' : ''}`}>
          <span className="notice__icon">{msg.kind === 'error' ? '✕' : '✓'}</span>
          <span>{msg.text}</span>
        </div>
      )}

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
          const on = activeDecks[d.id] !== false
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
