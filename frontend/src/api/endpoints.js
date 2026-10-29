/** auto 保留真实接口结果；只有显式演示模式使用内置样例。 */
import { request } from './http'
import { normalizeChat, normalizeSearch, normalizeUpload } from './normalize'
import { enrichChat, enrichSearch } from './mockAdapter'
import { useMockStore } from '@/store/mock'
import { DEMO_DATA } from '@/config/mock'
import { cacheCase } from '@/mock/fixtures/cacheCase'
import { SLOW_DELAY_MS } from '@/constants/limits'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
function source(scenario = 'auto') {
  if (scenario !== 'auto') return { demo: true, scenario }
  const mode = useMockStore().mode
  if (['local', 'original', 'similar', 'miss'].includes(mode)) {
    return { demo: true, scenario: mode === 'local' ? 'original' : mode }
  }
  return { demo: mode === 'apifox', network: true, scenario: 'auto',
    baseURL: mode === 'apifox' ? '/mock-api' : undefined }
}
async function demoFault(scenario) {
  if (scenario === 'slow') await delay(SLOW_DELAY_MS)
  if (scenario === 'timeout' || scenario === 'error') throw {
    kind: scenario === 'timeout' ? 'timeout' : 'http',
    code: scenario === 'timeout' ? 'TIMEOUT' : 'HTTP_500',
    message: scenario === 'timeout' ? '演示：请求超时' : '演示：请求失败（HTTP 500）'
  }
}
export async function searchQuestion(payload, opts = {}) {
  const origin = source(opts.scenario)
  const start = performance.now()
  if (origin.demo && !origin.network) await demoFault(origin.scenario)
  const raw = origin.network
    ? await request({ url: '/search', method: 'POST', data: payload, baseURL: origin.baseURL, signal: opts.signal })
    : DEMO_DATA[origin.scenario] ?? DEMO_DATA.original
  const result = origin.demo ? enrichSearch(normalizeSearch(raw), origin.scenario) : normalizeSearch(raw)
  result.fromMockFallback = origin.demo
  result.latencyMs = Math.round(performance.now() - start)
  return result
}
export async function sendChat(payload, opts = {}) {
  const origin = source(opts.scenario)
  if (origin.demo && !origin.network) await demoFault(origin.scenario)
  const revealed = payload.session_messages.some(m => m.role === 'user' && m.content.includes('我已主动选择查看答案'))
  const mode = revealed ? 'direct' : payload.mode
  const raw = origin.network
    ? await request({ url: '/chat', method: 'POST', data: payload, baseURL: origin.baseURL, signal: opts.signal })
    : DEMO_DATA.chat[mode]
  const reply = origin.demo ? enrichChat(normalizeChat(raw), mode, origin.scenario) : normalizeChat(raw)
  // 演示也遵循引导模式不提前返回工具结果的规则。
  if (mode === 'guided') reply.toolResult = ''
  return reply
}
export async function uploadFile(file, opts = {}) {
  const origin = source(opts.scenario)
  if (origin.demo && !origin.network) {
    await demoFault(origin.scenario)
    return { taskId: 'demo-upload', extractedText: cacheCase.uploadText, failures: [] }
  }
  const form = new FormData()
  form.append('file', file)
  return normalizeUpload(await request({ url: '/upload', method: 'POST', data: form,
    headers: { 'Content-Type': undefined }, baseURL: origin.baseURL, signal: opts.signal }))
}
