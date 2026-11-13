import { defineStore } from 'pinia'
import { loadJSON, saveJSON, removeKey, uid } from '../utils/storage'
import { chunkMaterial, buildContextChunks } from '../utils/chunkText'
import { buildExchangePayload, parseExchange } from '../utils/materialExchange'

const KEY = 'materials:v1'

/**
 * 个人资料库（需求 F06/F07 前端部分，P 包）
 * 上传/导入的资料按「前端无状态切片」原则切块后存在本地，
 * 请求 /api/chat 时由 buildContextChunks 汇总为 context_chunks 随请求透传。
 *
 * 每条资料同时保存 extracted_text 原文（用于交换格式导出）与 chunks（用于预览/上下文）。
 * 早于本版本的数据没有 extracted_text，由 restoreText 用 chunks 兜底，不影响读取。
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
      const text = extracted_text || ''
      // 用户重试识别或重复确认同一内容时复用已有资料，避免重复发送上下文。
      const texts = chunkMaterial('', text).map((chunk) => chunk.text)
      const existing = this.items.find((item) =>
        item.title === title && item.file_type === (file_type || 'text') &&
        item.chunks?.length === texts.length &&
        item.chunks.every((chunk, index) => chunk.text === texts[index])
      )
      if (existing) return existing
      const materialId = uid('mat')
      const now = new Date().toISOString()
      const material = {
        material_id: materialId,
        title: title || `资料 ${this.items.length + 1}`,
        file_type: file_type || 'text',
        extracted_text: text,
        chunks: chunkMaterial(materialId, text),
        created_at: now,
        updated_at: now
      }
      this.items.unshift(material)
      this.persist()
      return material
    },

    /**
     * 导入交换文件：先解析校验（不写入），返回预览结果。
     * 由页面展示条数/重复/错误，用户确认后再调用 confirmImport。
     */
    previewImport(text) {
      return parseExchange(text, this.items)
    },

    /**
     * 确认导入：把校验通过的候选条目切片后写入。
     * @param {Array} candidates parseExchange 返回的 candidates
     * @returns {number} 实际写入条数
     */
    confirmImport(candidates) {
      if (!Array.isArray(candidates) || !candidates.length) return 0
      const now = new Date().toISOString()
      const fresh = candidates.map((c) => ({
        material_id: c.material_id,
        title: c.title,
        file_type: c.file_type,
        extracted_text: c.extracted_text,
        chunks: chunkMaterial(c.material_id, c.extracted_text),
        created_at: c.created_at || now,
        updated_at: now
      }))
      this.items = [...fresh, ...this.items]
      this.persist()
      return fresh.length
    },

    /** 导出为交换格式 JSON 字符串（仅资料，不含聊天记录/Key/其他存储）。 */
    exportExchangeText() {
      return JSON.stringify(buildExchangePayload(this.items), null, 2)
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
