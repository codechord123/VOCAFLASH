import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 프리토킹 연습 앱. base는 GitHub Pages 등 서브경로 배포도 대비해 상대경로로.
export default defineConfig({
  plugins: [react()],
  base: './',
})
