/**
 * 小测作答状态（Beta §08）。
 *
 * 数据分两层：
 *   - 这里只存本机草稿与成绩：attempt_id / 题组版本 / 所选项 / 后端判分结果；
 *   - 标准答案与解析只在交卷响应里出现，出卷阶段前端手里根本没有，也不会猜。
 *
 * 与学习记录的边界（和龚巍斌约定）：本 store 暴露 getAttempt / listAttempts /
 * summaryOf，历史侧按 attempt_id 打开原草稿或固定成绩；小测不另建第二份会话存储。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { readJSON, writeJSON, isStorageAvailable } from '@/utils/wjStorage'
import { STORAGE_PREFIX } from '@/constants/storageKeys'
import { uid } from '@/utils/id'
import { ATTEMPT_STATUS, attemptSummary, cleanAnswers } from '@/utils/quiz'

const KEY = `${STORAGE_PREFIX}:quiz:attempts`
const MAX_ATTEMPTS = 50

function loadAttempts() {
  const raw = readJSON(KEY)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [id, item] of Object.entries(raw)) {
    if (!item || typeof item !== 'object' || item.attemptId !== id) continue
    out[id] = {
      attemptId: id,
      quizId: String(item.quizId ?? 'co-memory-01'),
      version: String(item.version ?? '1'),
      title: String(item.title ?? ''),
      questionCount: Number(item.questionCount) || 0,
      answers: item.answers && typeof item.answers === 'object' ? { ...item.answers } : {},
      status: item.status === ATTEMPT_STATUS.submitted ? ATTEMPT_STATUS.submitted : ATTEMPT_STATUS.draft,
      score: Number(item.score) || 0,
      total: Number(item.total) || 0,
      result: item.result ?? null,
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now()
    }
  }
  return out
}

export const useWjQuizStore = defineStore('wjQuiz', () => {
  const attempts = ref(loadAttempts())
  const currentAttemptId = ref('')
  const storageOk = computed(() => isStorageAvailable())

  function persist() {
    if (!storageOk.value) return
    writeJSON(KEY, attempts.value)
  }

  /** 开始一次作答（重做也走这里，生成新 ID，旧记录保留） */
  function createAttempt({ quizId, version, title, questionCount } = {}) {
    const id = uid('attempt')
    const now = Date.now()
    attempts.value[id] = {
      attemptId: id,
      quizId: String(quizId ?? 'co-memory-01'),
      version: String(version ?? '1'),
      title: String(title ?? ''),
      questionCount: Number(questionCount) || 0,
      answers: {},
      status: ATTEMPT_STATUS.draft,
      score: 0,
      total: 0,
      result: null,
      createdAt: now,
      updatedAt: now
    }
    currentAttemptId.value = id
    // 只保留最近 50 次，避免 localStorage 无限增长；旧备份导出仍兼容
    const ids = Object.keys(attempts.value).sort((a, b) => attempts.value[b].updatedAt - attempts.value[a].updatedAt)
    for (const stale of ids.slice(MAX_ATTEMPTS)) delete attempts.value[stale]
    persist()
    return attempts.value[id]
  }

  /** 记录一个选项；交卷后不再改动，保证成绩与作答一致 */
  function saveAnswer(attemptId, questionId, letter) {
    const attempt = attempts.value[attemptId]
    if (!attempt || attempt.status === ATTEMPT_STATUS.submitted) return false
    if (!questionId || !letter) return false
    attempt.answers = { ...attempt.answers, [questionId]: String(letter).toUpperCase() }
    attempt.updatedAt = Date.now()
    persist()
    return true
  }

  /** 只写入后端判分结果，不在前端算分 */
  function markSubmitted(attemptId, result, questions = []) {
    const attempt = attempts.value[attemptId]
    if (!attempt) return false
    attempt.questionCount = questions.length || attempt.questionCount
    attempt.answers = cleanAnswers(attempt.answers, questions)
    attempt.status = ATTEMPT_STATUS.submitted
    attempt.score = Number(result?.score) || 0
    attempt.total = Number(result?.total) || questions.length || 0
    attempt.result = result ?? null
    attempt.updatedAt = Date.now()
    persist()
    return true
  }

  function getAttempt(attemptId) {
    return attemptId ? attempts.value[attemptId] ?? null : null
  }

  /** 按题组列出记录，新的在前：未交卷和已交卷都能找回 */
  function listAttempts(quizId = null) {
    return Object.values(attempts.value)
      .filter(item => !quizId || item.quizId === quizId)
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  function summaryOf(attemptId) {
    return attemptSummary(getAttempt(attemptId))
  }

  function setCurrent(attemptId) {
    if (attemptId && attempts.value[attemptId]) currentAttemptId.value = attemptId
  }

  function removeAttempt(attemptId) {
    if (!attempts.value[attemptId]) return false
    delete attempts.value[attemptId]
    if (currentAttemptId.value === attemptId) currentAttemptId.value = ''
    persist()
    return true
  }

  return {
    attempts,
    currentAttemptId,
    storageOk,
    createAttempt,
    saveAnswer,
    markSubmitted,
    getAttempt,
    listAttempts,
    summaryOf,
    setCurrent,
    removeAttempt,
    flush: persist
  }
})
