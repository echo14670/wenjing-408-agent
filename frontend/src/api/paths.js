/**
 * 后端接口路径唯一登记处（G 包 · G3 / S1）。
 *
 * 为什么单独成文件：
 *   `endpoints.js` 依赖 `http.js`，而 `http.js`、`request.js` 又需要 baseURL 与路径常量；
 *   若把常量直接写在 `endpoints.js` 会形成循环依赖（endpoints → http → endpoints）。
 *   因此在这里定义，由 `endpoints.js` 统一再导出：调用方既可以
 *   `import { API_PATHS } from '@/api/endpoints'`，也可以从本文件取。
 *
 * 约定：
 *   - 这里只登记**后端路径**，不含 Mock 平台地址（Apifox 走 vite 的 /mock-api 代理）。
 *   - 组件不直接拼 URL；新增接口时先在这里登记，再在 endpoints/http 层消费。
 */

/** 后端 API 根路径；可用 VITE_API_BASE 覆盖（部署到子路径时用） */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export const API_PATHS = Object.freeze({
  base: '/api',
  search: '/search',
  chat: '/chat',
  upload: '/upload',
  health: '/health',
  recommend: '/recommend',
  /** 题目详情：GET `${API_PATHS.question}/${question_id}`，优先用 questionPath() 拼 */
  question: '/question'
})

/** 题目详情路径（对 id 做 URL 编码，避免特殊字符污染路径） */
export function questionPath(questionId) {
  return `${API_PATHS.question}/${encodeURIComponent(String(questionId ?? ''))}`
}
