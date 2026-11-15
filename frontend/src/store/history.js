import { defineStore } from 'pinia'
import { loadJSON, saveJSON, removeKey, uid } from '../utils/storage'
import { normalizeHistorySession, previewHistoryImport, historyExport } from '../utils/historyExchange'

const KEY = 'history:v1'
function loadSessions() {
  const stored = loadJSON(KEY, [])
  if (!Array.isArray(stored)) return []
  return stored.map(raw => {
    try { return normalizeHistorySession(raw) } catch { return null }
  }).filter(Boolean)
}

/**
 * 本地问答历史（需求 F07）
 * 数据结构对齐开发基准·数据字典：Session(mode) — Message(role/content/model_source) — AnswerAttempt。
 * 会话与消息仅存 localStorage，支持导出 / 导入 / 清空。
 */
export const useHistoryStore = defineStore('history', {
  state: () => ({
    sessions: loadSessions(),
    currentSessionId: null,
    persistenceError: ''
  }),

  getters: {
    currentSession(state) {
      return state.sessions.find((s) => s.session_id === state.currentSessionId) || null
    },
    /** 题干始终保留在现有 session_messages 中，其余只携带最近三轮。 */
    messagesForSession: (state) => (sessionId) => {
      const s = state.sessions.find((x) => x.session_id === sessionId)
      if (!s) return []
      const context = s.question_stem ? [{ role: 'user', content: s.question_stem }] : []
      if (s.mode === 'guided' && s.answer_revealed === true) {
        context.push({ role: 'user', content: '我已主动选择查看答案，可以结合完整答案继续讲解。' })
      }
      return context.concat((s.messages || []).slice(-6).map((m) => ({ role: m.role, content: m.content })))
    },
    currentMessages() {
      return this.messagesForSession(this.currentSessionId)
    }
  },

  actions: {
    persist() {
      const saved = saveJSON(KEY, this.sessions)
      this.persistenceError = saved ? '' : '历史未能写入浏览器，请先导出备份后重试。'
      return saved
    },

    /** 新旧页面共用的更新入口；省略的字段保留，显式传入的值才覆盖。 */
    upsertSession(input) {
      const id = input.session_id ?? input.sessionId ?? input.id
      const existing = this.sessions.find(s => s.session_id === id)
      const now = new Date().toISOString()
      const next = normalizeHistorySession({ ...input, session_id: id || uid('s'),
        created_at: existing?.created_at ?? now, updated_at: now }, existing)
      if (existing) Object.assign(existing, next)
      else this.sessions.unshift(next)
      this.currentSessionId = next.session_id
      this.persist()
      return existing ?? this.currentSession
    },

    /** 新建会话（搜索成功后调用） */
    createSession({ mode, questionId = null, questionStem = '', matchType = '', userAnswer = '', userReasoning = '' }) {
      return this.upsertSession({ mode, questionId, stem: questionStem, matchType,
        userThought: userAnswer, userReasoning })
    },

    appendMessage(sessionId, partial) {
      const session = this.sessions.find((s) => s.session_id === sessionId)
      if (!session) return null
      const message = normalizeHistorySession({ session_id: sessionId, mode: session.mode,
        messages: [{ ...partial, message_id: uid('m'), created_at: new Date().toISOString() }] }).messages[0]
      session.messages.push(message)
      session.updated_at = message.created_at
      this.persist()
      return message
    },

    updateAnswerAttempt(sessionId, { user_answer, user_reasoning }) {
      const session = this.sessions.find((s) => s.session_id === sessionId)
      if (!session) return
      session.answer_attempt = {
        user_answer: user_answer ?? session.answer_attempt.user_answer,
        user_reasoning: user_reasoning ?? session.answer_attempt.user_reasoning
      }
      session.updated_at = new Date().toISOString()
      this.persist()
    },

    revealAnswer(sessionId) {
      const session = this.sessions.find((s) => s.session_id === sessionId)
      if (!session) return
      session.answer_revealed = true
      session.updated_at = new Date().toISOString()
      this.persist()
    },

    setCurrent(sessionId) {
      this.currentSessionId = this.sessions.some(s => s.session_id === sessionId) ? sessionId : null
    },

    removeSession(sessionId) {
      this.sessions = this.sessions.filter((s) => s.session_id !== sessionId)
      if (this.currentSessionId === sessionId) this.currentSessionId = null
      this.persist()
    },

    clearAll() {
      this.sessions = []
      this.currentSessionId = null
      removeKey(KEY)
    },

    /** 导出：下载 JSON 文件 */
    exportJSON() {
      return historyExport(this.sessions)
    },

    previewImport(text) {
      return previewHistoryImport(text, this.sessions)
    },

    confirmImport(preview) {
      // 预览后期间可能新增会话；确认时重新校验和去重，避免覆盖或重复。
      const current = previewHistoryImport({ version: 1, sessions: preview.candidates }, this.sessions)
      const added = current.candidates.length
      const merged = [...this.sessions, ...current.candidates]
      if (added && !saveJSON(KEY, merged)) {
        throw new Error('浏览器存储写入失败，原有历史保持不变，请导出备份后重试')
      }
      if (added) {
        this.sessions = merged
        this.persistenceError = ''
      }
      return { added, skipped: preview.skipped.length + current.skipped.length,
        invalid: preview.invalid.length + current.invalid.length }
    },

    /** 导入：校验后合并（按 session_id 去重） */
    importJSON(text) {
      return this.confirmImport(this.previewImport(text)).added
    }
  }
})
