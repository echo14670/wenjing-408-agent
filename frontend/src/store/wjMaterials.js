/**
 * 本地个人资料库。
 *
 * 业务红线：个人资料不上传后端数据库。因此：
 *   /api/upload 只在前端把文字取回来 → 立即切片 → 只把切片存在浏览器本地，
 *   提问时再按 query 选出最相关的若干段，随 context_chunks 发送给 /api/chat。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { STORAGE_KEYS } from '@/constants/storageKeys'
import { readJSON, writeJSON } from '@/utils/wjStorage'
import { chunkTextPro, selectContextChunks, estimateTokens } from '@/utils/chunk'
import { FALLBACK_MATERIAL, uploadFile } from '@/api/endpoints'
import { uid } from '@/utils/id'
export const useWjMaterialsStore = defineStore('wjMaterials', () => {
  const items = ref([])
  const loading = ref(false)
  const error = ref(null)
  const lastImport = ref(null)
  const totalChunks = computed(() => items.value.reduce((n, m) => n + m.chunks.length, 0))
  function load() {
    const stored = readJSON(STORAGE_KEYS.materials)
    items.value = stored?.items ?? []
  }
  function persist() {
    writeJSON(STORAGE_KEYS.materials, { items: items.value })
  }
  function addFromText(name, text, failures = []) {
    const chunks = chunkTextPro(text, { keepHeading: true })
    const item = {
      id: uid('mat'),
      name,
      chunks: chunks.map((c) => ({ id: c.id, content: c.content, heading: c.heading, tokens: c.tokens })),
      importedAt: Date.now(),
      failures
    }
    items.value.unshift(item)
    persist()
    lastImport.value = { success: chunks.length, failed: failures.length, chunks: chunks.length }
    return item
  }
  /** 上传 → 取文 → 切片 → 入库 */
  async function importFile(file, scenario = 'auto') {
    loading.value = true
    error.value = null
    try {
      const res = await uploadFile(file, { scenario })
      if (!res.extractedText.trim()) {
        error.value = '未提取到可用文本，请换一份文件或手动粘贴'
        lastImport.value = { success: 0, failed: res.failures.length || 1, chunks: 0 }
        return
      }
      addFromText(file.name, res.extractedText, res.failures)
    } catch (err) {
      error.value = err?.message ?? '导入失败，请重试'
    } finally {
      loading.value = false
    }
  }
  /** 演示用：直接导入内置教材片段，保证没有文件也能跑通上下文链路 */
  function importSample() {
    return addFromText('示例资料 · 计组 4.2 Cache 地址映射.md', FALLBACK_MATERIAL)
  }
  /** 按 query 选出本次要发送的切片 */
  function contextFor(query, topK = 5, tokenBudget = 1200) {
    const pool = []
    items.value.forEach((m) => {
      m.chunks.forEach((c, i) => {
        pool.push({
          id: c.id,
          index: pool.length,
          content: c.content,
          heading: c.heading,
          tokens: c.tokens,
          start: 0,
          end: 0
        })
        void i
      })
    })
    if (!pool.length) return []
    return selectContextChunks(pool, query, { topK, tokenBudget }).map((c) => c.content)
  }
  function tokensOf(chunks) {
    return chunks.reduce((n, c) => n + estimateTokens(c), 0)
  }
  function remove(id) {
    items.value = items.value.filter((i) => i.id !== id)
    persist()
  }
  function clear() {
    items.value = []
    persist()
  }
  return {
    items,
    loading,
    error,
    lastImport,
    totalChunks,
    load,
    addFromText,
    importFile,
    importSample,
    contextFor,
    tokensOf,
    remove,
    clear
  }
})
