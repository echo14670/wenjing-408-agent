/**
 * 演示场景：前端在「不依赖后端」的前提下要把 8 种状态都能跑出来。
 * 场景优先级：URL query > 开发面板选择 > 接口返回推断。
 */
import { SCENARIO_STORAGE_KEY, readScenario } from './store'
export const SCENARIO_OPTIONS = [
  { value: 'auto', label: '跟随接口', hint: '按接口返回的 match_type 决定分支' },
  { value: 'original', label: '原题命中', hint: '题库核验解析 + 分步推导' },
  { value: 'similar', label: '相似题', hint: '仅供参考，禁用追问与作答' },
  { value: 'miss', label: '未命中', hint: '模型解题 + 依据缺口说明' },
  { value: 'empty', label: '空数据', hint: 'HTTP 200 但无可渲染内容' },
  { value: 'conflict', label: '解析冲突', hint: '模型结论与题库不一致，同屏对比' },
  { value: 'slow', label: '慢响应', hint: '人为延迟 3.5s，看骨架屏' },
  { value: 'error', label: '请求失败', hint: 'HTTP 500，验证错误态与重试' },
  { value: 'timeout', label: '请求超时', hint: '10 秒无响应' }
]
const VALID = new Set(SCENARIO_OPTIONS.map((o) => o.value))
export function normalizeScenario(value) {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  return VALID.has(v) ? v : null
}
/**
 * 解析最终生效的场景。
 * @param queryValue route.query.mock
 * @param storedPanel 开发面板里选的值（已持久化）
 */
export function resolveScenario(queryValue, storedPanel) {
  return normalizeScenario(queryValue) ?? storedPanel ?? readScenario() ?? 'auto'
}
export function persistScenario(scenario) {
  try {
    window.localStorage.setItem(SCENARIO_STORAGE_KEY, scenario)
  } catch {
    /* 忽略：存储不可用时场景仅本次生效 */
  }
}
/** 需要人为制造故障的场景 */
export function faultOf(scenario) {
  if (scenario === 'error') return 'error'
  if (scenario === 'timeout') return 'timeout'
  if (scenario === 'slow') return 'slow'
  return null
}
