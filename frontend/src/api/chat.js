import { request } from './client'
import { API_PATHS } from './paths'
import { useMockStore, isDemoMode } from '../store/mock'
import { DEMO_DATA } from '../config/mock'
import { CHAT_TIMEOUT_MS } from '../constants/limits'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 对话答疑 POST /api/chat
 * @param {object} payload
 *   session_messages: [{ role: 'user'|'assistant', content }]
 *   question_id, user_answer, mode ('direct'|'guided'), context_chunks: string[]
 * @param {object} opts
 *   signal: AbortSignal —— 切题/重复追问时取消上一次答疑
 *
 * 答疑走同一个客户端，但用更长的超时（CHAT_TIMEOUT_MS）：云端模型生成常超过 10s。
 * 502/503 的 retryable / retryAfterSeconds 由错误层保留，调用方可据此提示重试。
 */
export async function chatRequest(payload, { signal } = {}) {
  const mockStore = useMockStore()

  if (isDemoMode(mockStore.mode)) {
    await delay(600)
    const revealed = payload.session_messages?.some(
      (message) =>
        message.role === 'user' && message.content === '我已主动选择查看答案，可以结合完整答案继续讲解。'
    )
    const demo = DEMO_DATA.chat[revealed ? 'direct' : payload.mode] || DEMO_DATA.chat.direct
    return {
      ...demo,
      source: 'local-demo'
    }
  }

  const raw = await request({
    url: API_PATHS.chat,
    method: 'POST',
    data: payload,
    baseURL: mockStore.mode === 'apifox' ? '/mock-api' : undefined,
    timeout: CHAT_TIMEOUT_MS,
    signal
  })
  return {
    reply: raw?.reply ?? '',
    tool_result: raw?.tool_result ?? '',
    citations: Array.isArray(raw?.citations) ? raw.citations : [],
    source: mockStore.mode === 'apifox' ? 'apifox-mock' : 'backend'
  }
}
