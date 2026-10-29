/**
 * 接口封装。四个 Mock 端点集中在这里，方便后续一键切真后端。
 *
 * 场景故障（error / timeout / slow）在这一层注入：
 * 只有真实发起请求之后再抛错，才叫"验证异常态"，否则只是跳过联调。
 */
import { request } from './http'
import { normalizeChat, normalizeSearch, normalizeUpload } from './normalize'
import { enrichChat, enrichSearch, enrichUpload } from './mockAdapter'
import { faultOf } from '@/mock/scenarios'
import { SLOW_DELAY_MS } from '@/constants/limits'
import { cacheCase } from '@/mock/fixtures/cacheCase'
const MISS_RID = import.meta.env.VITE_APIFOX_MISS_RID ?? '342552720'
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
/** 按场景制造故障；返回 null 表示正常继续 */
async function applyFault(scenario) {
  const fault = faultOf(scenario)
  if (fault === 'slow') {
    await delay(SLOW_DELAY_MS)
    return
  }
  if (fault === 'error') {
    const err = {
      kind: 'http',
      code: 'HTTP_500',
      status: 500,
      message: '请求失败（HTTP 500）',
      detail: '演示场景：模拟后端内部错误'
    }
    throw err
  }
  if (fault === 'timeout') {
    const err = {
      kind: 'timeout',
      code: 'TIMEOUT',
      message: '请求超时（10 秒无响应）',
      detail: '演示场景：模拟长耗时请求'
    }
    throw err
  }
}
/**
 * 查题检索。
 * scenario=miss 时会带上 apifoxResponseId 走 Mock 的「未命中」示例响应，
 * 这样连 miss 分支也是真实请求，而不是前端硬编码。
 */
export async function searchQuestion(payload, opts = {}) {
  const scenario = opts.scenario ?? 'auto'
  const started = performance.now()
  const params = scenario === 'miss' ? { apifoxResponseId: MISS_RID } : undefined
  let raw
  try {
    raw = await request({
      url: '/search',
      method: 'POST',
      data: payload,
      params,
      signal: opts.signal
    })
  } catch (err) {
    // 真实请求失败时，仍然按场景决定是否注入故障（保证 error 场景必定可达）
    await applyFault(scenario)
    throw err
  }
  await applyFault(scenario)
  const normalized = normalizeSearch(raw)
  const enriched = enrichSearch(normalized, scenario)
  enriched.latencyMs = Math.round(performance.now() - started)
  return enriched
}
export async function sendChat(payload, opts = {}) {
  const scenario = opts.scenario ?? 'auto'
  const started = performance.now()
  let raw
  try {
    raw = await request({
      url: '/chat',
      method: 'POST',
      data: payload,
      signal: opts.signal
    })
  } catch (err) {
    await applyFault(scenario)
    throw err
  }
  await applyFault(scenario)
  const normalized = normalizeChat(raw)
  const enriched = enrichChat(normalized, payload.mode, scenario)
  enriched.latencyMs = Math.round(performance.now() - started)
  return enriched
}
export async function uploadFile(file, opts = {}) {
  const scenario = opts.scenario ?? 'auto'
  const form = new FormData()
  form.append('file', file)
  let raw
  try {
    raw = await request({
      url: '/upload',
      method: 'POST',
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: opts.signal
    })
  } catch (err) {
    await applyFault(scenario)
    throw err
  }
  await applyFault(scenario)
  return enrichUpload(normalizeUpload(raw))
}
/** 场景兜底用的题面：当 upload 完全不可用时，仍能演示切片与追问 */
export const FALLBACK_MATERIAL = cacheCase.material
