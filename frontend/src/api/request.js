import axios from 'axios'

/**
 * Axios 请求封装（统一走 Vite 代理，见 vite.config.js）
 * 前端只请求相对路径 /api/*，由 dev server 代理到 Apifox Mock / 本地后端，规避 CORS。
 */
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json; charset=utf-8' }
})

/** 把各种失败原因转成用户可读的中文提示 */
function friendlyError(error) {
  if (error.response) {
    const status = error.response.status
    if (status === 404) return '接口地址不存在（404），请检查 Mock 链接是否过期或代理配置'
    if (status === 500) return '服务端错误（500），请稍后重试或联系后端'
    if (status === 429) return '请求过于频繁（429），请稍后重试'
    return `请求失败（HTTP ${status}）`
  }
  if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) {
    return '请求超时，请检查网络或 Mock 地址是否可达'
  }
  if (/Network Error|ECONNREFUSED|ERR_CONNECTION/i.test(error.message || '')) {
    return '无法连接服务，请确认已启动 npm run dev（代理依赖 dev server）'
  }
  return error.message || '网络请求失败'
}

request.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(new Error(friendlyError(error)))
)

export default request
