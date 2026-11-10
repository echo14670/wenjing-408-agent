/**
 * 请求层（新栈）：统一超时、统一错误形状。
 *
 * 组件层拿到的永远是 AppError（kind/code/status/detail/message），
 * 不需要判断 axios error 的各种分支；错误构造与旧栈 `request.js` 共用
 * `errors.js` 的 `toAppError()`，两条栈形状一致（S1），但本轮不合并。
 */
import axios from 'axios'
import { REQUEST_TIMEOUT_MS } from '@/constants/limits'
import { API_BASE } from './paths'
import { toAppError } from './errors'

export const http = axios.create({
  baseURL: API_BASE,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' }
})

/** 保留原有导出：外部若直接 import toAppError，行为不变 */
export { toAppError }

/** 包装请求：把异常统一成 AppError 抛出，调用方只 catch AppError */
export async function request(config) {
  try {
    const res = await http.request(config)
    return res.data
  } catch (err) {
    throw toAppError(err)
  }
}

/** 让请求可被外部取消（页面卸载/切换场景时用） */
export function withSignal(signal) {
  return signal ? { signal } : {}
}
