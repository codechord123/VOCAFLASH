import { useCallback, useEffect, useRef, useState } from 'react'

// 드래그해서 담기.
//
// 단어 탭·문장 담기(☆)로는 못 잡는 자리가 있다. "I have been raised with
// all the freedom they had fought for"처럼 대사의 한 토막만 갖고 싶을 때,
// 줄 전체를 담으면 군더더기가 붙고 단어 하나로는 그 구조가 안 남는다.
// 읽다가 손으로 그은 만큼만 담는 것이 가장 정확하다.
//
// 브라우저 기본 선택 메뉴(복사하기·찾아보기)는 그대로 뜬다. 우리 버튼은
// 그 아래에 띄워 겹치지 않게 한다.

/** 선택 영역을 지켜보다가 위치와 텍스트를 준다. 컨테이너 밖은 무시한다. */
export function useTextSelection(containerRef) {
  const [sel, setSel] = useState(null) // { text, rect }

  const read = useCallback(() => {
    const s = window.getSelection()
    if (!s || s.isCollapsed || s.rangeCount === 0) {
      setSel(null)
      return
    }
    const range = s.getRangeAt(0)
    const container = containerRef.current
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setSel(null)
      return
    }
    const text = s.toString().trim().replace(/\s+/g, ' ')
    // 한두 글자는 대개 실수로 그은 것이다
    if (text.length < 3) {
      setSel(null)
      return
    }
    const rect = range.getBoundingClientRect()
    setSel({ text, rect })
  }, [containerRef])

  useEffect(() => {
    // 손을 떼는 순간에만 본다. 끄는 동안 계속 그리면 버튼이 따라다닌다.
    const onUp = () => window.setTimeout(read, 10)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchend', onUp)
    document.addEventListener('selectionchange', () => {
      const s = window.getSelection()
      if (!s || s.isCollapsed) setSel(null)
    })
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchend', onUp)
    }
  }, [read])

  const clear = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setSel(null)
  }, [])

  return { sel, clear }
}

/**
 * 화면 아래에 붙는 담기 바.
 *
 * 예전에는 그은 자리 바로 아래에 띄웠는데, 아이폰이 같은 자리에 자기
 * 메뉴(복사하기·선택 영역 찾기·찾아보기)를 올려서 둘이 겹쳤다. 그 메뉴는
 * 그은 글 근처에만 뜨므로, 우리 바를 화면 맨 아래로 내리면 자리가 아예
 * 안 겹친다. 서서 볼 때 엄지가 닿는 곳이기도 하다.
 */
export default function SelectionSave({ sel, saved, onSave, onClose }) {
  const ref = useRef(null)
  if (!sel) return null

  const words = sel.text.split(' ').length

  return (
    <div ref={ref} className="sel-bar" role="dialog" aria-label="선택한 부분 담기">
      {/* 무엇을 담는지 보여준다 — 화면 아래에서는 그은 자리가 안 보일 수 있다 */}
      <span className="sel-bar__text">{sel.text}</span>
      <button className="btn btn--primary btn--sm" onClick={() => onSave(sel.text)} disabled={saved}>
        {saved ? '이미 담음' : `★ 담기 (${words}단어)`}
      </button>
      <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="닫기">
        ✕
      </button>
    </div>
  )
}
