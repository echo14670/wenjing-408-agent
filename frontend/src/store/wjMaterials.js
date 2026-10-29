/** 答疑页复用已有 materials:v1，不自动导入演示资料。 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useMaterialsStore } from './materials'
import { selectContextChunks, estimateTokens } from '@/utils/chunk'
import { uploadFile } from '@/api/endpoints'
export const useWjMaterialsStore = defineStore('wjMaterials', () => {
  const base = useMaterialsStore()
  const loading = ref(false)
  const error = ref(null)
  const pendingImport = ref(null)
  const lastImport = ref(null)
  const items = computed(() => base.items.map(m => ({
    id: m.material_id, name: m.title,
    chunks: m.chunks.map(c => ({ ...c, content: c.text, tokens: estimateTokens(c.text) }))
  })))
  function addFromText(name, text) {
    if (!text.trim()) return null
    return base.addFromUpload({ title: name, file_type: 'text', extracted_text: text })
  }
  async function importFile(file, scenario = 'auto') {
    loading.value = true; error.value = null; pendingImport.value = null
    try {
      const result = await uploadFile(file, { scenario })
      if (!result.extractedText.trim()) throw new Error('未提取到可用文本，请重试或手动输入')
      pendingImport.value = { name: file.name, ...result }
      return pendingImport.value
    } catch (err) { error.value = err.message } finally { loading.value = false }
  }
  function confirmImport(text = pendingImport.value?.extractedText ?? '') {
    if (!pendingImport.value || !text.trim()) return null
    const item = addFromText(pendingImport.value.name, text)
    lastImport.value = { chunks: item.chunks.length, failed: pendingImport.value.failures.length }
    pendingImport.value = null
    return item
  }
  function contextFor(query) {
    const pool = items.value.flatMap(m => m.chunks).map((c, index) => ({ ...c, index }))
    return selectContextChunks(pool, query, { topK: 5, tokenBudget: 1200 }).map(c => c.content)
  }
  return { items, loading, error, pendingImport, lastImport,
    totalChunks: computed(() => base.totalChunks), load() {}, addFromText,
    importFile, confirmImport, contextFor,
    tokensOf: chunks => chunks.reduce((n, c) => n + estimateTokens(c), 0),
    remove: id => base.removeMaterial(id), clear: () => base.clearAll() }
})
