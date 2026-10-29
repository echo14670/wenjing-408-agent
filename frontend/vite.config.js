import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

/**
 * Apifox Mock 基址（团队约定，见「stage2 - 接口联调与开发交接.md」）
 *  原题   /api/search
 *  未命中 /api/search?apifoxResponseId=342552720
 *  对话   /api/chat
 *  上传   /api/upload
 *
 * 浏览器直连 Mock 域名会触发 CORS（交接文档避坑指南），
 * 因此前端统一请求相对路径 /api/*，由 Vite 开发服务器代理到 Mock 基址。
 * 后端就绪后，把这里的 target 改成本地后端地址（如 http://localhost:8000）即可，前端代码无需改动。
 */
const APIFOX_BASE = 'https://m1.apifoxmock.com/m1/8972811-8778665-default'

export default defineConfig({
  plugins: [vue()],
  // 答疑展示模块内部统一用 @/ 引用，避免 ../../../ 层级地狱
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: APIFOX_BASE,
        changeOrigin: true,
        rewrite: (path) => path // 保持 /api/search 原样，拼到 Mock 基址之后
      }
    }
  }
})
