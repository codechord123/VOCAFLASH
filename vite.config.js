import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * CSS를 index.html 안에 통째로 넣는다.
 *
 * 배포된 화면에서 스타일만 통째로 빠진 적이 있다(스크립트는 정상 동작).
 * 별도 파일로 나간 CSS는 캐시·MIME 타입·경로 재작성 어디에서든 조용히
 * 실패할 수 있고, 실패해도 화면은 '뜨긴 뜨는' 상태라 알아채기 어렵다.
 * 13KB짜리 스타일시트를 굳이 따로 받아올 이유가 없으므로 HTML에 심는다 —
 * 요청이 하나로 줄고, 스타일 없는 화면이 나오는 경우의 수가 사라진다.
 */
function inlineCss() {
  return {
    name: 'inline-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html']
      if (!html) return

      const cssFiles = Object.keys(bundle).filter((f) => f.endsWith('.css'))
      if (cssFiles.length === 0) return

      let css = ''
      for (const file of cssFiles) {
        css += bundle[file].source
        delete bundle[file] // 따로 내보내지 않는다
      }

      html.source = html.source
        .replace(/<link[^>]+rel="stylesheet"[^>]*>/g, '')
        .replace('</head>', `<style>${css}</style></head>`)
    },
  }
}

export default defineConfig({
  plugins: [react(), inlineCss()],
  // 서브경로 배포(GitHub Pages)도 대비해 상대경로로 둔다.
  base: './',
})
