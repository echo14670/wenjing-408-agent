/**
 * 请求层：统一超时、统一错误形状。
 *
 * 组件层拿到的永远是 AppError（kind/code/message），
 * 不需要判断 axios error 的各种分支，UI 只按 kind 决定文案。
 */
import axios, { AxiosError } from 'axios'
import { REQUEST_TIMEOUT_MS } from '@/constants/limits'
const baseURL = import.meta.env.VITE_API_BASE ?? '/api'
export const http = axios.create({
  baseURL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' }
})
export function toAppError(err) {
  if (isAppError(err)) return err
  const axiosErr = err
  if (axiosErr?.isAxiosError) {
    const status = axiosErr.response?.status
    const code = axiosErr.code ?? ''
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      return {
        kind: 'timeout',
        code: 'TIMEOUT',
        message: `请求超时（${Math.round(REQUEST_TIMEOUT_MS / 1000)} 秒无响应）`
      }
    }
    if (!axiosErr.response) {
      return {
        kind: 'network',
        code: 'NETWORK',
        message: '网络不可达，请检查连接或 Mock 服务状态',
        detail: axiosErr.message
      }
    }
    const serverMsg =
      axiosErr.response.data?.detail?.message ??
      axiosErr.response.data?.message ??
      axiosErr.response.data?.errorMessage ??
      (typeof axiosErr.response.data === 'string' ? axiosErr.response.data : '') ??
      ''
    return {
      kind: 'http',
      code: axiosErr.response.data?.errorCode ?? `HTTP_${status ?? 0}`,
      message: status ? `请求失败（HTTP ${status}）` : '请求失败',
      status,
      detail: serverMsg || axiosErr.message
    }
  }
  return {
    kind: 'unknown',
    code: 'UNKNOWN',
    message: '发生未知错误',
    detail: err instanceof Error ? err.message : String(err)
  }
}
function isAppError(value) {
  return typeof value === 'object' && value !== null && 'kind' in value && 'code' in value
}
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
