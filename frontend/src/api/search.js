import request from './request'
import { useMockStore } from '../store/mock'
import { DEMO_DATA, MATCH_TYPE_META, MISS_RESPONSE_ID } from '../config/mock'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function normalizeResult(raw, source) {
  const type = raw && MATCH_TYPE_META[raw.match_type] ? raw.match_type : 'unknown'
  return {
    match_type: type,
    question_data: raw?.question_data ?? null,
    similar_questions: Array.isArray(raw?.similar_questions) ? raw.similar_questions : [],
    source
  }
}

/**
 * 查题检索 POST /api/search
 * @param {object} payload { raw_input, input_type }（input_type: text | image）
 * @param {object} opts
 *   mock: 'auto' | 'original' | 'similar' | 'miss'  —— auto 时使用全局 Mock 开关
 *   当 mock 为 'miss' 且走 apifox 时，自动追加 apifoxResponseId=342552720 切换未命中响应
 */
export async function searchQuestion(payload, { mock = 'auto' } = {}) {
  const mockStore = useMockStore()
  const mode = mock === 'auto' ? mockStore.mode : mock

  if (mode === 'local' || ['original', 'similar', 'miss'].includes(mode)) {
    // 本地样例：返回契约结构数据，模拟 500ms 网络延迟
    await delay(500)
    // mode 可能为 'local'（全局默认），此时按三态演示的入口态展示（默认原题）
    const key = DEMO_DATA[mode] ? mode : 'original'
    return normalizeResult(DEMO_DATA[key], 'local-demo')
  }

  // apifox 真实 Mock
  const params = mode === 'miss' ? { apifoxResponseId: MISS_RESPONSE_ID } : undefined
  const raw = await request.post('/search', payload, { params, baseURL: mode === 'apifox' ? '/mock-api' : undefined })
  return normalizeResult(raw, mode === 'apifox' ? 'apifox-mock' : 'backend')
}
