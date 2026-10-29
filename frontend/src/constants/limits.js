/** 数值常量集中管理，便于联调时一处调整 */
/** 请求超时（毫秒）——与 useAsyncState 的 timeout 判定保持一致 */
export const REQUEST_TIMEOUT_MS = 10000
/** 场景面板里 slow 场景的人为延迟 */
export const SLOW_DELAY_MS = 3500
/** 本地历史：最多保留的会话数 */
export const HISTORY_MAX_SESSIONS = 50
/** 本地历史：单会话最多消息数 */
export const HISTORY_MAX_MESSAGES = 200
/** 本地历史：单条消息正文上限 */
export const HISTORY_MAX_CONTENT = 2000
/** 历史写入防抖 */
export const HISTORY_DEBOUNCE_MS = 400
/** 摘要长度上限 */
export const STEM_SUMMARY_MAX = 80
export const ANSWER_DIGEST_MAX = 120
/** 长文本切片默认参数 */
export const CHUNK_DEFAULTS = {
  targetSize: 300,
  maxSize: 480,
  minSize: 80,
  overlap: 60
}
/** context_chunks 选取默认参数 */
export const CONTEXT_DEFAULTS = {
  topK: 5,
  tokenBudget: 1200,
  minScore: 0.05
}
/** 上传文件大小上限（前端先拦一道，避免白传） */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024
