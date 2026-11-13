import { request } from './client'
import { API_PATHS } from './paths'
import { useMockStore, isDemoMode } from '../store/mock'
import { DEMO_DATA } from '../config/mock'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 文件上传 POST /api/upload（form-data，键名 file）
 *
 * 统一客户端不设默认 Content-Type，FormData 会被浏览器/axios 自动编码成
 * 带 boundary 的 multipart/form-data，不需要在调用处覆盖请求头。
 * 错误仍是 AppError，415/413/400 的具体原因用 `uploadErrorInfo(err)` 取。
 *
 * @param {File|Blob} file
 * @param {object} opts { signal }
 * @returns { task_id, extracted_text, failure_details, source }
 */
export async function uploadFile(file, { signal } = {}) {
  const mockStore = useMockStore()

  if (isDemoMode(mockStore.mode)) {
    await delay(700)
    return { ...DEMO_DATA.upload, source: 'local-demo' }
  }

  const form = new FormData()
  form.append('file', file)
  const raw = await request({
    url: API_PATHS.upload,
    method: 'POST',
    data: form,
    baseURL: mockStore.mode === 'apifox' ? '/mock-api' : undefined,
    signal
  })
  return {
    task_id: raw?.task_id ?? '',
    extracted_text: raw?.extracted_text ?? '',
    failure_details: Array.isArray(raw?.failure_details) ? raw.failure_details : [],
    source: mockStore.mode === 'apifox' ? 'apifox-mock' : 'backend'
  }
}
