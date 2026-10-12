import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { canSpeak, speak, stopSpeaking } from '../lib/tts.js'

/**
 * 듣기 버튼. 누르면 영어 문장을 읽고, 읽는 동안 한 번 더 누르면 멈춘다.
 * 손가락 끝으로 누르기 좋게 탭 영역은 44px.
 */
export default function ListenButton({ text, label = '듣기', compact = false, autoPlay = false }) {
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!autoPlay || !text) return
    // 화면에 들어서자마자 한 번 — 이 원자의 본체가 소리일 때
    setPlaying(true)
    speak(text).then(() => setPlaying(false))
    return () => stopSpeaking()
  }, [autoPlay, text])

  useEffect(() => () => {
    if (playing) stopSpeaking()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!canSpeak() || !text) return null

  return (
    <button
      type="button"
      className={`listen-btn${compact ? ' listen-btn--compact' : ''}${playing ? ' is-playing' : ''}`}
      aria-label={playing ? '멈추기' : label}
      // 카드는 누르기·끌기를 받아 뒤집고 넘긴다 — 듣기 버튼의 손가락이
      // 카드까지 내려가지 않게 끊는다
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation() // 카드 뒤집기·줄 선택과 겹치지 않게
        if (playing) {
          stopSpeaking()
          setPlaying(false)
          return
        }
        setPlaying(true)
        speak(text).then(() => setPlaying(false))
      }}
    >
      <Icon name="speaker" size={compact ? 18 : 20} />
      {!compact && <span>{playing ? '멈추기' : label}</span>}
    </button>
  )
}
