import { defineStore } from 'pinia'
import { loadJSON, saveJSON, removeKey, uid } from '../utils/storage'

const KEY = 'history:v1'

/**
 * 本地问答历史（需求 F07）
 * 数据结构对齐开发基准·数据字典：Session(mode) — Message(role/content/model_source) — AnswerAttempt。
 * 会话与消息仅存 localStorage，支持导出 / 导入 / 清空。
 */
export const useHistoryStore = defineStore('history', {
  state: () => ({
    sessions: loadJSON(KEY, []),
    currentSessionId: null
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
      saveJSON(KEY, this.sessions)
    },

    /** 新建会话（搜索成功后调用） */
    createSession({ mode, questionId = null, questionStem = '', matchType = '', userAnswer = '', userReasoning = '' }) {
      const now = new Date().toISOString()
      const session = {
        session_id: uid('s'),
        mode,
        question_id: questionId,
        question_stem: questionStem,
        answer_revealed: false,
        match_type: matchType,
        title: (questionStem || '未命名提问').slice(0, 24),
        answer_attempt: { user_answer: userAnswer, user_reasoning: userReasoning },
        messages: [],
        created_at: now,
        updated_at: now
      }
      this.sessions.unshift(session)
      this.currentSessionId = session.session_id
      this.persist()
      return session
    },

    appendMessage(sessionId, { role, content, model_source = null }) {
      const session = this.sessions.find((s) => s.session_id === sessionId)
      if (!session) return null
      const message = {
        message_id: uid('m'),
        role,
        content,
        model_source,
        created_at: new Date().toISOString()
      }
      session.messages.push(message)
      session.updated_at = message.created_at
      this.persist()
      return message
    },

    updateAnswerAttempt(sessionId, { user_answer, user_reasoning }) {
      const session = this.sessions.find((s) => s.session_id === sessionId)
      if (!session) return
      session.answer_attempt = { user_answer, user_reasoning }
      session.updated_at = new Date().toISOString()
      this.persist()
    },

    revealAnswer(sessionId) {
      const session = this.sessions.find((s) => s.session_id === sessionId)
      if (!session) return
      session.answer_revealed = true
      this.persist()
    },

    setCurrent(sessionId) {
      this.currentSessionId = sessionId
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
      const payload = {
        version: 1,
        exported_at: new Date().toISOString(),
        sessions: this.sessions
      }
      return JSON.stringify(payload, null, 2)
    },

    /** 导入：校验后合并（按 session_id 去重） */
    importJSON(text) {
      const data = JSON.parse(text)
      if (!data || !Array.isArray(data.sessions)) throw new Error('文件格式不正确：缺少 sessions 数组')
      const valid = data.sessions.filter((s) => s && s.session_id && Array.isArray(s.messages))
      const existing = new Set(this.sessions.map((s) => s.session_id))
      const merged = [...this.sessions, ...valid.filter((s) => !existing.has(s.session_id))]
      this.sessions = merged
      this.persist()
      return valid.length
    }
  }
})
