/**
 * 统一请求客户端（Alpha 冲刺 · TD-02 / §3.7）。
 *
 * 背景：#20 已把错误形状（errors.js）与路径（paths.js）统一，但项目里仍有
 * `request.js` / `http.js` 两个 axios 实例，各自带一份超时与请求头规则。
 * 本文件是**唯一**的 axios 实例，承担全部传输规则：
 *
 *   1. 基础地址        API_BASE（可用 VITE_API_BASE 覆盖）
 *   2. 默认超时        REQUEST_TIMEOUT_MS（10s）
 *   3. 长任务超时      由调用方覆盖：答疑 CHAT_TIMEOUT_MS（120s）、health 5s、推荐 6s、详情 8s
 *   4. 取消           透传 AbortSignal；取消统一映射为 kind='canceled'，不算服务故障
 *   5. 错误           一律经 errors.js 的 toAppError() 转成 AppError 后抛出
 *   6. 重试信息       保留 retryable / retryAfterSeconds（响应体字段优先，其次 Retry-After 头）
 *
 * 关于 Content-Type（关键）：
 *   这里**故意不设**默认 `Content-Type: application/json`。
 *   axios 对普通对象会自动用 application/json，对 FormData 会自动交给浏览器
 *   生成带 boundary 的 multipart/form-data；一旦默认写死 JSON 头，
 *   axios 会把 FormData 序列化成 JSON，上传直接 422。
 *   因此统一的传输规则是「不预设 Content-Type」，而不是在调用处逐个
 *   `headers: { 'Content-Type': undefined }` 打补丁。
 */
import axios from 'axios'
import { REQUEST_TIMEOUT_MS } from '@/constants/limits'
import { API_BASE } from './paths'
import { toAppError, isCanceled } from './errors'

/** 唯一 axios 实例：新增接口只能复用它，不允许再 axios.create() */
export const http = axios.create({
  baseURL: API_BASE,
  timeout: REQUEST_TIMEOUT_MS,
  // 只声明接受 JSON；Content-Type 由 axios 按 data 类型自动决定（见文件头说明）
  headers: { Accept: 'application/json' }
})

/**
 * 发请求并直接返回响应体（而不是 axios 的 response 包装）。
 * 失败时抛出 AppError（kind/code/status/detail/message[/retryable/retryAfterSeconds]）。
 */
export async function request(config = {}) {
  try {
    const res = await http.request(config)
    return res.data
  } catch (err) {
    throw toAppError(err)
  }
}

/** 让请求可被取消：`request({ ...withSignal(controller.signal) })` */
export function withSignal(signal) {
  return signal ? { signal } : {}
}

/** 兼容保留：外部若直接 import toAppError / isCanceled，行为不变 */
export { toAppError, isCanceled }
