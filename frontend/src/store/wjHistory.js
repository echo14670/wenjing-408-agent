/** 新答疑界面的历史适配层，统一写入 history:v1。 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useHistoryStore } from './history'
import { isStorageAvailable } from '@/utils/wjStorage'

function view(s) {
  if (!s) return null
  return {
    id: s.session_id, questionId: s.question_id, stem: s.question_stem,
    stemSummary: s.title, mode: s.mode, matchType: s.match_type,
    userThought: s.answer_attempt?.user_answer ?? '',
    messages: (s.messages || []).map(m => ({ ...m, id: m.message_id ?? m.id })),
    result: s.result_snapshot, lastReply: s.last_reply,
    chatStatus: s.chat_status, chatError: s.chat_error,
    answerRevealed: s.answer_revealed === true,
    createdAt: Date.parse(s.created_at), updatedAt: Date.parse(s.updated_at),
    messageCount: s.messages?.length ?? 0
  }
}
export const useWjHistoryStore = defineStore('wjHistory', () => {
  const base = useHistoryStore()
  const reloadedNotice = ref(false)
  const index = computed(() => base.sessions.map(view))
  const current = computed(() => view(base.currentSession))
  const storageOk = computed(() => isStorageAvailable())
  function load() { /* 数据由共享 store 读取；这里不另建一份历史。 */ }
  function getSession(id) { return view(base.sessions.find(s => s.session_id === id)) }
  function findByQuestion(stem, mode) {
    return view(base.sessions.find(s => s.question_stem === stem && (!mode || s.mode === mode)))
  }
  function setCurrent(record) { base.setCurrent(record?.id ?? null) }
  function upsert(input) {
    let record = base.sessions.find(s => s.session_id === input.sessionId)
    if (!record) {
      record = base.createSession({ mode: input.mode, questionId: input.questionId,
        questionStem: input.stem, matchType: input.matchType, userAnswer: input.userThought })
    }
    Object.assign(record, {
      mode: input.mode, question_id: input.questionId, match_type: input.matchType,
      question_stem: input.stem, title: input.stem.slice(0, 24),
      answer_attempt: { ...record.answer_attempt, user_answer: input.userThought },
      answer_revealed: input.answerRevealed === true,
      messages: input.messages.map(m => ({ ...m, message_id: m.message_id ?? m.id })),
      result_snapshot: input.result, last_reply: input.lastReply,
      chat_status: input.chatStatus, chat_error: input.chatError,
      updated_at: new Date().toISOString()
    })
    base.setCurrent(record.session_id)
    base.persist()
    return view(record)
  }
  function markReferenceExposed(exposed) {
    if (exposed && base.currentSession) base.revealAnswer(base.currentSessionId)
  }
  return { index, current, storageOk, reloadedNotice, degradation: 'none',
    hasHistory: computed(() => index.value.length > 0), load, getSession, findByQuestion,
    upsert, setCurrent, markReferenceExposed, flush: () => base.persist(),
    remove: id => base.removeSession(id), clear: () => base.clearAll(), exportJSON: () => base.exportJSON() }
})
