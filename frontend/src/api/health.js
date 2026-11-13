/**
 * 服务状态（G2 / BUG-08 / D10）。
 *
 * 只做一件事：读 `GET /api/health` 里的 `llm_configured / llm_model`，
 * 给侧栏一个“模型已连接 / 模型未配置 / 模型状态未知”的轻量状态。
 *
 * 红线：
 *   - 只读这两个布尔/字符串字段，**绝不读取或展示 Key**；
 *   - `llm_configured=true` 只代表服务端已配置 Key，不代表模型一定可用
 *     （真实可用性以 /api/chat 为准，见契约 §3.4-B）；
 *   - 接口不可达、字段缺失、响应异常 → 一律“状态未知”，不猜测、不沿用旧值。
 */
import { reactive, readonly } from 'vue'
import { request } from './client'
import { API_PATHS } from './paths'

/** 状态缓存时间：同一页面内反复挂载侧栏不重复请求 */
export const HEALTH_TTL_MS = 60_000

const state = reactive({
  /** connected | unconfigured | unknown */
  status: 'unknown',
  llmConfigured: null,
  model: '',
  questions: null,
  checkedAt: null,
  loading: false,
  error: ''
})

/** 供组件只读消费 */
export const healthState = readonly(state)

let inflight = null
let lastCheckedAt = 0

function normalize(raw) {
  const payload = raw && typeof raw === 'object' ? raw : {}
  const configured = typeof payload.llm_configured === 'boolean' ? payload.llm_configured : null
  return {
    status: configured === true ? 'connected' : configured === false ? 'unconfigured' : 'unknown',
    llmConfigured: configured,
    model: typeof payload.llm_model === 'string' ? payload.llm_model.trim() : '',
    questions: Number.isFinite(payload.questions) ? payload.questions : null,
    checkedAt: Date.now(),
    error: ''
  }
}

/**
 * 刷新服务状态。
 * @param {object} opts
 *   force: 忽略 60s 缓存
 *   timeout: 健康检查单独的超时（默认 5s，避免拖慢首屏）
 */
export async function refreshHealth({ force = false, timeout = 5000 } = {}) {
  if (!force && lastCheckedAt && Date.now() - lastCheckedAt < HEALTH_TTL_MS) return state
  if (inflight) return inflight
  state.loading = true
  inflight = (async () => {
    try {
      const raw = await request({ url: API_PATHS.health, method: 'GET', timeout })
      Object.assign(state, normalize(raw))
      lastCheckedAt = Date.now()
    } catch (err) {
      // 不可达/字段异常：明确回到“未知”，不保留上一次的 connected
      Object.assign(state, {
        status: 'unknown',
        llmConfigured: null,
        model: '',
        checkedAt: Date.now(),
        error: err?.code || 'HEALTH_UNAVAILABLE'
      })
      lastCheckedAt = 0 // 失败不缓存，下次挂载可重试
    } finally {
      state.loading = false
      inflight = null
    }
    return state
  })()
  return inflight
}

/** 侧栏文案：三态；model 为空时不拼括号，避免出现“模型已连接（）” */
export function modelStatusLabel(source = state) {
  if (source.status === 'connected') return source.model ? `模型已连接（${source.model}）` : '模型已连接'
  if (source.status === 'unconfigured') return '模型未配置'
  return '模型状态未知'
}

/** 状态说明（tooltip）：讲清“已配置 ≠ 一定可用”，也说明不展示 Key */
export function modelStatusHint(source = state) {
  if (source.status === 'connected') {
    return `已检测到服务端配置了模型（${source.model || '名称未提供'}）；真实可用性以答疑请求为准`
  }
  if (source.status === 'unconfigured') return '服务端未配置模型 Key，答疑会返回不可用提示'
  return '暂时无法读取 /api/health，或后端尚未提供模型状态字段'
}

/** 测试/切换环境时重置模块级状态 */
export function resetHealth() {
  Object.assign(state, {
    status: 'unknown',
    llmConfigured: null,
    model: '',
    questions: null,
    checkedAt: null,
    loading: false,
    error: ''
  })
  lastCheckedAt = 0
  inflight = null
}
