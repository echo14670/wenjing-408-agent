import axios from 'axios'
import { API_BASE } from './paths'
import { toAppError } from './errors'

/**
 * 旧请求栈（郑志銮负责的输入/结果页沿用的 axios 实例）。
 *
 * G1 / S1 / BUG-07：
 *   以前这里只按状态码拼“请求失败（HTTP 415）”，把后端
 *   `{ detail: { code, message } }` 直接丢掉，用户看不到具体原因。
 *   现在统一由 `errors.js` 转成 AppError（kind/code/status/detail/message），
 *   与新栈 `http.js` 形状完全一致；调用方既可以直接展示 `error.message`，
 *   也可以用 `errorText()` / `uploadErrorInfo()` 取更精确的原因。
 *
 * 注意：只统一错误形状，不与新栈合并（栈合并按任务书顺延）。
 */
const request = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json; charset=utf-8' }
})

request.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(toAppError(error))
)

export default request
