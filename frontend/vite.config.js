import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// /api 连接实际后端；/mock-api 单独连接 Apifox，互不替换数据。
const APIFOX_BASE = 'https://m1.apifoxmock.com/m1/8972811-8778665-default'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
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
      '/mock-api': {
        target: APIFOX_BASE, changeOrigin: true,
        rewrite: path => path.replace(/^\/mock-api/, '/api')
      },
      '/api': {
        target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: path => path
      }
    }
  }
  }
})
