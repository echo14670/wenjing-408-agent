/**
 * 同考点练习（切题）状态。
 *
 * 只存"跨组件需要共享的薄状态"：正在切换的锁、上一次切换的审计快照。
 * 题目内容本身仍然放在 session store —— 切题不是开新上下文，而是替换同一份上下文。
 *
 * 为什么不把 lastSwitch 塞进 session：session.reset() 会清掉它，
 * 而"刚切完题、要告诉用户隔离了什么"恰恰发生在这之后。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { loadJSON, saveJSON } from '@/utils/storage'

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
  return Array.isArray(raw) ? raw.filter((c) => c && typeof c.id === 'string' && c.stem).slice(-MAX_CANDIDATES) : []
}

export const useWjPracticeStore = defineStore('wjPractice', () => {
  /** 切换中：防止连点两次推荐，产生两条并发请求 */
  const switching = ref(false)
  /** 正在切往哪道题：切题失败时"重试"要重试它，而不是退回关键词检索 */
  const pending = ref(null)
  /** 上一次切题：{ from, to, mode, audit, at } */
  const lastSwitch = ref(null)
  /** 用户是否关掉了隔离说明 */
  const noticeDismissed = ref(false)
  /** 本地已做过的题号：透传给后端 done_question_ids，刷新后仍要排除 */
  const doneIds = ref(readIds())
  /** 最近用过的候选快照：刷新时按 question_id 还原，不依赖内置示例题库 */
  const candidateCache = ref(readCandidates())

  const noticeVisible = computed(() => Boolean(lastSwitch.value) && !noticeDismissed.value)

  function markDone(questionId) {
    if (!questionId || typeof questionId !== 'string') return
    const next = [...doneIds.value.filter((id) => id !== questionId), questionId].slice(-MAX_DONE)
    doneIds.value = next
    saveJSON(DONE_KEY, next)
  }
  function clearDone() {
    doneIds.value = []
    saveJSON(DONE_KEY, [])
  }
  function rememberCandidate(candidate) {
    if (!candidate?.id) return
    const next = [...candidateCache.value.filter((c) => c.id !== candidate.id), candidate].slice(-MAX_CANDIDATES)
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
    clearDone,
    rememberCandidate,
    candidateById,
    reset
  }
})
