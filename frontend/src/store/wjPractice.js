/**
 * 同考点练习（切题）状态。
 *
 * 保存切题状态、隔离说明、已做题和最近的真实候选。当前练习会话仍由 session store 持有。
 *
 * 为什么不把 lastSwitch 塞进 session：session.reset() 会清掉它，
 * 而"刚切完题、要告诉用户隔离了什么"恰恰发生在这之后。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { loadJSON, saveJSON } from '@/utils/storage'
import { useHistoryStore } from './history'

const DONE_KEY = 'practice-done'
const CANDIDATES_KEY = 'practice-candidates'
const MAX_DONE = 100
const MAX_CANDIDATES = 20

function readIds() {
  const raw = loadJSON(DONE_KEY, [])
  return Array.isArray(raw)
    ? [...new Set(raw.filter((id) => typeof id === 'string' && id.trim()))].slice(-MAX_DONE)
    : []
}
function readCandidates() {
  const raw = loadJSON(CANDIDATES_KEY, [])
  return Array.isArray(raw)
    ? raw.filter((c) => c?.demo === false && typeof c.id === 'string' && c.stem).slice(-MAX_CANDIDATES)
    : []
}

export const useWjPracticeStore = defineStore('wjPractice', () => {
  const history = useHistoryStore()
  /** 切换中：防止连点两次推荐，产生两条并发请求 */
  const switching = ref(false)
  /** 正在切往哪道题：切题失败时"重试"要重试它，而不是退回关键词检索 */
  const pending = ref(null)
  /** 上一次切题：{ from, to, mode, audit, at } */
  const lastSwitch = ref(null)
  /** 用户是否关掉了隔离说明 */
  const noticeDismissed = ref(false)
  const completedIds = ref(readIds())
  const doneIds = computed(() => {
    const studiedIds = history.sessions.filter(record =>
      record.match_type === 'original' && typeof record.question_id === 'string' && record.question_id.trim() &&
      !record.result_snapshot?.fromMockFallback &&
      (record.answer_revealed || String(record.answer_attempt?.user_answer ?? '').trim())
    ).map(record => record.question_id).reverse()
    return [...new Set([...studiedIds, ...completedIds.value])].slice(-MAX_DONE)
  })
  /** 最近用过的候选快照：刷新时按 question_id 还原，不依赖内置示例题库 */
  const candidateCache = ref(readCandidates())

  const noticeVisible = computed(() => Boolean(lastSwitch.value) && !noticeDismissed.value)

  function markDone(questionId) {
    if (!questionId || typeof questionId !== 'string') return
    completedIds.value = [...completedIds.value.filter(id => id !== questionId), questionId].slice(-MAX_DONE)
    saveJSON(DONE_KEY, completedIds.value)
  }
  function rememberCandidate(candidate) {
    if (!candidate?.id) return
    const next = [...candidateCache.value.filter((c) => c.id !== candidate.id), { ...candidate, demo: false }]
      .slice(-MAX_CANDIDATES)
    candidateCache.value = next
    saveJSON(CANDIDATES_KEY, next)
  }
  function candidateById(id) {
    return id ? candidateCache.value.find((c) => c.id === id) ?? null : null
  }

  function beginSwitch() {
    switching.value = true
  }
  function recordSwitch(payload) {
    lastSwitch.value = { ...payload, at: Date.now() }
    noticeDismissed.value = false
  }
  function completeSwitch(to) {
    if (lastSwitch.value) lastSwitch.value = { ...lastSwitch.value, to }
    switching.value = false
  }
  function failSwitch() {
    switching.value = false
  }
  function dismissNotice() {
    noticeDismissed.value = true
  }
  /** 只重置本次切换的瞬态；已做题与候选缓存是跨刷新数据，不清 */
  function reset() {
    switching.value = false
    pending.value = null
    lastSwitch.value = null
    noticeDismissed.value = false
  }

  return {
    switching,
    pending,
    lastSwitch,
    noticeDismissed,
    noticeVisible,
    doneIds,
    candidateCache,
    beginSwitch,
    recordSwitch,
    completeSwitch,
    failSwitch,
    dismissNotice,
    markDone,
    rememberCandidate,
    candidateById,
    reset
  }
})
