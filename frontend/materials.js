import { defineStore } from 'pinia'
import { loadJSON, saveJSON, removeKey, uid } from '../utils/storage'
import { chunkMaterial, buildContextChunks } from '../utils/chunkText'

const KEY = 'materials:v1'

/**
 * 个人资料库（需求 F06/F07 前端部分）
 * 上传/导入的资料按「前端无状态切片」原则切块后存在本地，
 * 请求 /api/chat 时由 buildContextChunks 汇总为 context_chunks 随请求透传。
 */
export const useMaterialsStore = defineStore('materials', {
  state: () => ({
    items: loadJSON(KEY, [])
  }),

  getters: {
    totalChunks(state) {
      return state.items.reduce((n, m) => n + (m.chunks?.length || 0), 0)
    },
    /** 组装好的 context_chunks（默认取最新 20 块，控制请求体大小） */
    contextChunks() {
      return buildContextChunks(this.items, 20)
    }
  },

  actions: {
    persist() {
      saveJSON(KEY, this.items)
    },

    /** 从上传接口结果导入资料并切片 */
    addFromUpload({ title, file_type, extracted_text }) {
      const materialId = uid('mat')
      const now = new Date().toISOString()
      const material = {
        material_id: materialId,
        title: title || `资料 ${this.items.length + 1}`,
        file_type: file_type || 'text',
        chunks: chunkMaterial(materialId, extracted_text || ''),
        created_at: now,
        updated_at: now
      }
      this.items.unshift(material)
      this.persist()
      return material
    },

    removeMaterial(materialId) {
      this.items = this.items.filter((m) => m.material_id !== materialId)
      this.persist()
    },

    clearAll() {
      this.items = []
      removeKey(KEY)
    }
  }
})
