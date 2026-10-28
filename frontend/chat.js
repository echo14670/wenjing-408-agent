import request from './request'
import { useMockStore } from '../store/mock'
import { DEMO_DATA } from '../config/mock'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 对话答疑 POST /api/chat
 * @param {object} payload
 *   session_messages: [{ role: 'user'|'assistant', content }]
 *   question_id, user_answer, mode ('direct'|'guided'), context_chunks: string[]
 */
export async function chatRequest(payload) {
  const mockStore = useMockStore()

  if (mockStore.mode !== 'apifox') {
    await delay(600)
    const demo = DEMO_DATA.chat[payload.mode] || DEMO_DATA.chat.direct
    return {
      ...demo,
      source: 'local-demo'
    }
  }

  const raw = await request.post('/chat', payload)
  return {
    reply: raw?.reply ?? '',
    tool_result: raw?.tool_result ?? '',
    citations: Array.isArray(raw?.citations) ? raw.citations : [],
    source: 'apifox-mock'
  }
}
