import request from './request'
import { useMockStore } from '../store/mock'
import { DEMO_DATA } from '../config/mock'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 文件上传 POST /api/upload（form-data，键名 file）
 * @param {File} file
 * @returns { task_id, extracted_text, failure_details, source }
 */
export async function uploadFile(file) {
  const mockStore = useMockStore()

  if (mockStore.mode !== 'apifox') {
    await delay(700)
    return { ...DEMO_DATA.upload, source: 'local-demo' }
  }

  const form = new FormData()
  form.append('file', file)
  const raw = await request.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return {
    task_id: raw?.task_id ?? '',
    extracted_text: raw?.extracted_text ?? '',
    failure_details: Array.isArray(raw?.failure_details) ? raw.failure_details : [],
    source: 'apifox-mock'
  }
}
