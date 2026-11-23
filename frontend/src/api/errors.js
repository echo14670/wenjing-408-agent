/**
 * 前端统一错误层（G 包 · G1 / S1 / BUG-07）。
 *
 * 两套请求栈（旧栈 `request.js`、新栈 `http.js`）都必须抛出同一种形状：
 *   { kind, code, status?, detail?, message, retryable?, retryAfterSeconds? }
 *
 * 字段约定：
 *   kind              timeout | canceled | network | http | unknown
 *   code              后端业务码（如 unsupported_type），没有时退化为 HTTP_415
 *   status            HTTP 状态码；网络/超时错误没有
 *   detail            后端返回的可读原因（`data.detail.message` / `data.message` / 字符串）
 *   message           直接可展示的文案：优先用 detail，其次按状态码给兜底，绝不只是状态码
 *   retryable         chat 502/503 契约字段，保留给上层决定是否展示“重试”
 *   retryAfterSeconds chat 502/503 契约字段
 *
 * 约束：不允许把后端返回的 HTML 错误页、超长堆栈直接塞给用户；统一截断。
 */

const MAX_TEXT = 300

/** 各状态码的兜底文案；后端给了可读 detail 时以 detail 为准 */
export const STATUS_FALLBACK = {
  400: '请求参数有误（400），请检查输入后重试',
  401: '未授权（401），请检查访问凭证',
  403: '无访问权限（403）',
  404: '接口地址不存在（404），请检查后端服务或代理配置',
  405: '请求方法不被允许（405），请检查接口定义',
  413: '文件超过大小限制（413），请压缩后重试',
  415: '不支持的文件类型（415），请更换文件后重试',
  422: '请求参数校验未通过（422），请检查字段格式',
  429: '请求过于频繁（429），请稍后重试',
  500: '服务端错误（500），请稍后重试或联系后端',
  502: '上游服务错误（502），请稍后重试',
  503: '服务暂不可用（503），请稍后重试'
}

/** 截断并压平空白，避免把整页 HTML/堆栈打到界面上 */
function tidy(value, max = MAX_TEXT) {
  if (typeof value !== 'string') return ''
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  // 后端 500 有时直接返回 HTML 错误页，对用户没有信息量
  if (/^<!doctype|^<html/i.test(text)) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function isAppError(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.kind === 'string' &&
    typeof value.code === 'string' &&
    'message' in value
  )
}

/**
 * 是否是「主动取消」而不是服务故障。
 *
 * AbortController / axios CancelToken 抛出的错误没有 response，若按普通网络错误
 * 处理，界面会显示“网络不可达”，把用户的取消动作说成故障（TD-02 验收项）。
 */
export function isCanceled(error) {
  if (!error) return false
  if (error.kind === 'canceled') return true
  if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') return true
  return error.__CANCEL__ === true
}

/** 从响应头读 Retry-After：支持秒数（30）与 HTTP 日期两种写法 */
function parseRetryAfter(headers) {
  if (!headers) return undefined
  let raw
  if (typeof headers.get === 'function') raw = headers.get('retry-after')
  if (raw === undefined || raw === null || raw === '') {
    raw = headers['retry-after'] ?? headers['Retry-After']
  }
  if (raw === undefined || raw === null || raw === '') return undefined
  const text = String(raw).trim()
  if (/^\d+$/.test(text)) return Number(text)
  const at = Date.parse(text)
  if (!Number.isNaN(at)) return Math.max(0, Math.round((at - Date.now()) / 1000))
  return undefined
}

/** 超时文案：不足 1 秒时用毫秒，避免出现“0 秒无响应” */
function timeoutText(timeoutMs) {
  if (!timeoutMs) return '请求超时，请检查网络后重试'
  return timeoutMs >= 1000
    ? `请求超时（${Math.round(timeoutMs / 1000)} 秒无响应）`
    : `请求超时（${timeoutMs} 毫秒无响应）`
}

/**
 * 从后端响应体里提取 code / message / retryable / retryAfterSeconds。
 * 兼容：
 *   { detail: { code, message, retryable, retry_after_seconds } }   upload / chat
 *   { detail: "..." }                                               HTTPException 字符串
 *   { detail: [{ loc, msg, type }] }                                FastAPI 422
 *   { message } / { errorCode } / { errorMessage }                  旧接口 / Mock
 *   纯字符串
 */
export function pickServerError(data) {
  if (data === null || data === undefined) return {}
  if (typeof data === 'string') {
    const message = tidy(data)
    return message ? { message } : {}
  }
  if (Array.isArray(data)) {
    const messages = data
      .map((item) => (typeof item === 'string' ? item : item?.msg ?? item?.message))
      .map((item) => tidy(item))
      .filter(Boolean)
    return messages.length ? { code: 'validation_error', message: messages.join('；') } : {}
  }
  if (typeof data !== 'object') return {}

  const detail = data.detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const message = tidy(detail.message) || tidy(data.message)
    return {
      code: typeof detail.code === 'string' && detail.code ? detail.code : undefined,
      message: message || undefined,
      retryable: typeof detail.retryable === 'boolean' ? detail.retryable : undefined,
      retryAfterSeconds:
        Number.isFinite(detail.retry_after_seconds) ? detail.retry_after_seconds : undefined
    }
  }
  if (typeof detail === 'string') {
    const message = tidy(detail)
    if (message) return { message }
  }
  if (Array.isArray(detail)) return pickServerError(detail)

  const message = tidy(data.message) || tidy(data.errorMessage) || tidy(data.error_message)
  const code = typeof data.errorCode === 'string' && data.errorCode ? data.errorCode : undefined
  return { message: message || undefined, code }
}

/**
 * 任意异常 → AppError。
 * 两套请求栈共用这一个实现，保证“旧栈 / 新栈错误形状一致”。
 */
export function toAppError(error) {
  if (isAppError(error)) return error
  if (typeof error === 'string') {
    const message = tidy(error) || '请求失败，请稍后重试'
    return { kind: 'unknown', code: 'UNKNOWN', message, detail: message }
  }

  const response = error?.response
  const status = Number.isFinite(response?.status) ? response.status : undefined
  const rawCode = typeof error?.code === 'string' ? error.code : ''

  // 取消不是故障：单独一种 kind，调用方据此不展示错误态
  if (isCanceled(error)) {
    return { kind: 'canceled', code: 'CANCELED', message: '请求已取消' }
  }

  if (rawCode === 'ECONNABORTED' || rawCode === 'ETIMEDOUT' || /timeout/i.test(error?.message || '')) {
    const timeoutMs = Number(error?.config?.timeout) || 0
    return {
      kind: 'timeout',
      code: 'TIMEOUT',
      message: timeoutText(timeoutMs)
    }
  }

  if (!response) {
    return {
      kind: 'network',
      code: 'NETWORK',
      message: '网络不可达，请检查连接或后端服务状态',
      detail: tidy(error?.message, 200) || undefined
    }
  }

  const server = pickServerError(response.data)
  const code = server.code || `HTTP_${status ?? 0}`
  const fallback = status ? STATUS_FALLBACK[status] : ''
  // 503/429 等场景后端可能只给 Retry-After 头，这里与响应体字段合并
  const retryAfterSeconds = server.retryAfterSeconds ?? parseRetryAfter(response?.headers)
  return {
    kind: 'http',
    code,
    status,
    message: server.message || fallback || '请求失败，请稍后重试',
    detail: server.message || undefined,
    ...(server.retryable === undefined ? {} : { retryable: server.retryable }),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds })
  }
}

/** 取可直接展示的文案：detail → message → 兜底 */
export function errorText(error, fallback = '请求失败，请稍后重试') {
  if (!error) return fallback
  if (typeof error === 'string') return error.trim() || fallback
  return tidy(error.detail) || tidy(error.message) || fallback
}

/** 上传错误码 → 兜底文案（后端没给 detail 时用） */
const UPLOAD_CODE_TEXT = {
  empty_file: '文件为空，请重新选择',
  file_too_large: '文件超过大小限制，请压缩后重试',
  unsupported_type: '不支持的文件类型，请更换文件后重试'
}

/** HTTP 状态码 → 上传错误码（后端旧版本只返回状态码时兜底） */
const UPLOAD_STATUS_CODE = {
  400: 'empty_file',
  413: 'file_too_large',
  415: 'unsupported_type'
}

/**
 * 上传失败信息：给 SearchView 用。
 * 返回 { code, status, message }；message 优先用后端 detail（例如“不支持的文件类型：.bin”），
 * 这样 400/413/415 不会再只显示“请求失败（HTTP 415）”。
 */
export function uploadErrorInfo(error) {
  const app = toAppError(error)
  const status = Number.isFinite(app.status) ? app.status : undefined
  const known = Object.prototype.hasOwnProperty.call(UPLOAD_CODE_TEXT, app.code)
  const code = known ? app.code : UPLOAD_STATUS_CODE[status] ?? app.code ?? ''
  const message =
    tidy(app.detail) ||
    UPLOAD_CODE_TEXT[code] ||
    tidy(app.message) ||
    '上传失败，请稍后重试'
  return { code, status: status ?? null, message }
}
