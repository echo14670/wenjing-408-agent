/** 当前答疑上下文：一次查询的题目、匹配结果、消息流与切片上下文 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { uid } from '@/utils/id'
export const useSessionStore = defineStore('session', () => {
  /** 用户原始输入 */
  const rawInput = ref('')
  const historyId = ref(null)
  const answerRevealed = ref(false)
  /** 我的思路（可空） */
  const myThought = ref('')
  /** 讲解模式：默认引导，符合"先提示再给答案"的产品主张 */
  const mode = ref('guided')
  /** 检索结果 */
  const result = ref(null)
  /** 检索状态 */
  const status = ref('idle')
  const error = ref(null)
  /** 对话消息流 */
  const messages = ref([])
  const chatStatus = ref('idle')
  const chatError = ref(null)
  /** 最近一次对话回复（含引用与工具结果） */
  const lastReply = ref(null)
  /** 本次随 /api/chat 发送的切片（用于 ChunkPreview 展示，不落库） */
  const contextChunks = ref([])
  const chunkTokens = ref(0)
  /** 是否从本地历史恢复 */
  const restoredFromHistory = ref(false)
  const matchType = computed(() => result.value?.matchType ?? 'miss')
  const question = computed(() => result.value?.question ?? null)
  const similar = computed(() => result.value?.similar ?? [])
  const isOriginal = computed(() => matchType.value === 'original')
  const isSimilar = computed(() => matchType.value === 'similar')
  const isMiss = computed(() => matchType.value === 'miss' || matchType.value === 'unknown')
  const questionId = computed(() => question.value?.questionId ?? null)
  /** 相似候选不绑定为原题，用户仍可询问自己的题干。 */
  const canFollowUp = computed(() => ['success', 'similar', 'miss'].includes(status.value) && chatStatus.value !== 'loading')
  const canAnswer = computed(() => canFollowUp.value)
  /** 引导模式下答案默认收起；直接讲解默认展开 */
  const answerCollapsed = computed(() => mode.value === 'guided' && !answerRevealed.value)
  const visibleMessages = computed(() => messages.value.filter(m => !answerCollapsed.value || m.role === 'user' || m.kind !== 'final'))
  function nowMessage(partial) {
    return { id: uid('m'), createdAt: Date.now(), ...partial }
  }
  function addMessage(message) {
    const full = nowMessage(message)
    messages.value.push(full)
    return full
  }
  function reset() {
    historyId.value = null
    answerRevealed.value = false
    lastReply.value = null
    result.value = null
    status.value = 'idle'
    error.value = null
    messages.value = []
    chatStatus.value = 'idle'
    chatError.value = null
    lastReply.value = null
    contextChunks.value = []
    chunkTokens.value = 0
    restoredFromHistory.value = false
  }
  function setMode(next) {
    mode.value = next
  }
  return {
    rawInput,
    historyId,
    answerRevealed,
    myThought,
    mode,
    result,
    status,
    error,
    messages,
    chatStatus,
    chatError,
    lastReply,
    contextChunks,
    chunkTokens,
    restoredFromHistory,
    matchType,
    question,
    similar,
    isOriginal,
    isSimilar,
    isMiss,
    questionId,
    canFollowUp,
    canAnswer,
    answerCollapsed,
    visibleMessages,
    addMessage,
    reset,
    setMode
  }
})
