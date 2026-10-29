/**
 * 本地问答历史。
 *
 * 三条硬约束：
 *   1. 个人资料不上传后端 → 切片原文不入库，只存摘要（count / tokens / headings）。
 *   2. 存储可能随时爆掉 → QuotaExceeded 三级降级，最差也要保住索引。
 *   3. 刷新不能丢当前进度 → 索引 + 详情分 key 存，详情惰性读取。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { STORAGE_KEYS } from '@/constants/storageKeys'
import {
  ANSWER_DIGEST_MAX,
  HISTORY_DEBOUNCE_MS,
  HISTORY_MAX_CONTENT,
  HISTORY_MAX_MESSAGES,
  HISTORY_MAX_SESSIONS,
  STEM_SUMMARY_MAX
} from '@/constants/limits'
import { readJSON, writeJSON, removeKey, clearAll, isStorageAvailable, listKeys } from '@/utils/wjStorage'
import { debounce } from '@/utils/debounce'
import { clip } from '@/utils/format'
import { uid } from '@/utils/id'
function toIndex(record) {
  return {
    id: record.id,
    questionId: record.questionId,
    matchType: record.matchType,
    subject: record.subject,
    stemSummary: record.stemSummary,
    mode: record.mode,
    updatedAt: record.updatedAt,
    messageCount: record.messageCount,
    degraded: record.degraded
  }
}
function clampMessages(messages) {
  let list = messages.map((m) => ({
    ...m,
    content:
      m.content.length > HISTORY_MAX_CONTENT ? `${m.content.slice(0, HISTORY_MAX_CONTENT)}…（已截断）` : m.content
  }))
  if (list.length <= HISTORY_MAX_MESSAGES) return list
  // 超出上限：保留首条用户消息 + 最近的消息，丢掉中间的旧内容
  const head = list.slice(0, 1)
  const tail = list.slice(list.length - (HISTORY_MAX_MESSAGES - 1))
  list = [...head, ...tail]
  return list
}
export const useWjHistoryStore = defineStore('wjHistory', () => {
  const index = ref([])
  const current = ref(null)
  const reloadedNotice = ref(false)
  const degradation = ref('none')
  const storageOk = computed(() => isStorageAvailable())
  const hasHistory = computed(() => index.value.length > 0)
  /* ---------------- 写入（防抖 + 降级） ---------------- */
  function persistIndex() {
    let result = writeJSON(STORAGE_KEYS.historyIndex, index.value)
    if (result === 'quota') {
      // 一级降级：删最旧 10 个会话后重试
      const victims = [...index.value].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, 10)
      victims.forEach((v) => removeKey(STORAGE_KEYS.historySessionPrefix + v.id))
      index.value = index.value.filter((i) => !victims.some((v) => v.id === i.id))
      result = writeJSON(STORAGE_KEYS.historyIndex, index.value)
      degradation.value = 'trimmed'
    }
    if (result !== 'ok') {
      degradation.value = 'memory'
    }
  }
  function persistSession(record) {
    let result = writeJSON(STORAGE_KEYS.historySessionPrefix + record.id, record)
    if (result === 'quota') {
      // 二级降级：所有消息正文截断到 400 字后重试
      const trimmed = {
        ...record,
        messages: record.messages.map((m) => ({ ...m, content: clip(m.content, 400) }))
      }
      result = writeJSON(STORAGE_KEYS.historySessionPrefix + record.id, trimmed)
      degradation.value = 'trimmed'
    }
    if (result !== 'ok') {
      // 三级降级：只保索引（摘要仍可见），详情标记为 degraded
      degradation.value = 'index-only'
      const i = index.value.findIndex((v) => v.id === record.id)
      if (i >= 0) index.value[i] = { ...index.value[i], degraded: true }
    }
  }
  const flushWrites = debounce(() => {
    persistIndex()
    if (current.value) persistSession(current.value)
  }, HISTORY_DEBOUNCE_MS)
  /** 立即落盘（页面卸载、路由离开时调用） */
  function flush() {
    flushWrites.flush()
  }
  /* ---------------- 读取 ---------------- */
  function load() {
    const stored = readJSON(STORAGE_KEYS.historyIndex)
    index.value = Array.isArray(stored) ? stored : []
    cleanupOrphans()
    reloadedNotice.value = false
  }
  /** 清理索引里已不存在的详情 key，避免存储泄漏 */
  function cleanupOrphans() {
    const valid = new Set(index.value.map((i) => STORAGE_KEYS.historySessionPrefix + i.id))
    listKeys()
      .filter((k) => k.startsWith(STORAGE_KEYS.historySessionPrefix) && !valid.has(k))
      .forEach(removeKey)
  }
  function getSession(id) {
    const record = readJSON(STORAGE_KEYS.historySessionPrefix + id)
    return record && record.id ? record : null
  }
  /** 按 question_id 找最近一次会话，用于刷新后恢复 */
  function findByQuestion(questionId) {
    if (!questionId) return null
    const item = index.value.find((i) => i.questionId === questionId)
    return item ? getSession(item.id) : null
  }
  /** 新建或更新一条会话；同题同模式视为同一条，便于"刷新后接着问" */
  function upsert(input) {
    const existing = current.value && current.value.questionId === input.questionId ? current.value : null
    const now = Date.now()
    const record = existing
      ? {
          ...existing,
          matchType: input.matchType,
          subject: input.subject,
          stemSummary: clip(input.stem, STEM_SUMMARY_MAX),
          userAnswerDigest: clip(input.userThought, ANSWER_DIGEST_MAX),
          messages: clampMessages(input.messages),
          attempt: input.attempt ?? existing.attempt,
          chunkDigest: input.chunkDigest ?? existing.chunkDigest,
          updatedAt: now,
          messageCount: input.messages.length
        }
      : {
          id: uid('s'),
          questionId: input.questionId,
          matchType: input.matchType,
          subject: input.subject,
          stemSummary: clip(input.stem, STEM_SUMMARY_MAX),
          userAnswerDigest: clip(input.userThought, ANSWER_DIGEST_MAX),
          mode: input.mode,
          messages: clampMessages(input.messages),
          attempt: input.attempt ?? null,
          chunkDigest: input.chunkDigest ?? null,
          createdAt: now,
          updatedAt: now,
          messageCount: input.messages.length
        }
    current.value = record
    const item = toIndex(record)
    const idx = index.value.findIndex((i) => i.id === record.id)
    if (idx >= 0) index.value[idx] = item
    else index.value.unshift(item)
    // LRU：超出上限时按 updatedAt 淘汰最旧
    if (index.value.length > HISTORY_MAX_SESSIONS) {
      const sorted = [...index.value].sort((a, b) => b.updatedAt - a.updatedAt)
      const keep = sorted.slice(0, HISTORY_MAX_SESSIONS)
      const dropped = index.value.filter((i) => !keep.some((k) => k.id === i.id))
      dropped.forEach((d) => removeKey(STORAGE_KEYS.historySessionPrefix + d.id))
      index.value = keep
      if (current.value && dropped.some((d) => d.id === current.value?.id)) current.value = null
    }
    flushWrites()
    return record
  }
  function setCurrent(record) {
    current.value = record
  }
  /** 标记用户已展开参考答案（教学模式分析用） */
  function markReferenceExposed(exposed) {
    if (!current.value) return
    current.value = {
      ...current.value,
      attempt: {
        userAnswer: current.value.attempt?.userAnswer ?? '',
        submittedAt: current.value.attempt?.submittedAt ?? Date.now(),
        verdict: current.value.attempt?.verdict ?? 'pending',
        referenceExposed: exposed
      },
      updatedAt: Date.now()
    }
    flushWrites()
  }
  function remove(id) {
    index.value = index.value.filter((i) => i.id !== id)
    removeKey(STORAGE_KEYS.historySessionPrefix + id)
    if (current.value?.id === id) current.value = null
    flushWrites()
  }
  function clear() {
    index.value = []
    current.value = null
    clearAll()
    reloadedNotice.value = false
  }
  /** 导出为 JSON 文件内容（去掉工具调用里的 request_id 等运行时字段） */
  function exportJSON() {
    const sessions = index.value.map((i) => getSession(i.id)).filter((s) => !!s)
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        sessions
      },
      null,
      2
    )
  }
  return {
    index,
    current,
    degradation,
    storageOk,
    hasHistory,
    reloadedNotice,
    load,
    getSession,
    findByQuestion,
    upsert,
    setCurrent,
    markReferenceExposed,
    remove,
    clear,
    exportJSON,
    flush
  }
})
