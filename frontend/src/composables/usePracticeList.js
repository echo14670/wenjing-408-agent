/**
 * 候选列表的取数与状态机（纯列表逻辑，不碰 session）。
 *
 * 状态：idle → loading → ready | empty | error
 * 之所以不复用 useAnswerFlow：那份 flow 里带请求序号，跨实例调用会互相失效；
 * 切题必须发生在答案页同一个 flow 实例里，列表取数则谁用谁建。
 */
import { computed, ref } from 'vue'
import { fetchRecommendations } from '@/api/practice'
import { pickCandidates } from '@/utils/practice'

export function usePracticeList() {
  const status = ref('idle')
  const candidates = ref([])
  const error = ref(null)
  const note = ref('')
  const fromFallback = ref(false)
  const knowledgePoint = ref('')
  /** 上一次请求的上下文，重试时无需页面再传一遍 */
  let lastCtx = null

  const loading = computed(() => status.value === 'loading')
  const isEmpty = computed(() => status.value === 'empty')
  const isError = computed(() => status.value === 'error')

  async function load(ctx) {
    if (status.value === 'loading') return
    lastCtx = ctx
    status.value = 'loading'
    error.value = null
    try {
      const res = await fetchRecommendations(
        {
          questionId: ctx.questionId,
          knowledgePoint: ctx.knowledgePoint,
          subject: ctx.subject,
          limit: ctx.limit ?? 3
        },
        { variant: ctx.variant }
      )
      if (lastCtx !== ctx) return // 期间又换了题，丢弃旧响应
      note.value = res.note ?? ''
      fromFallback.value = Boolean(res.fromFallback)
      knowledgePoint.value = res.knowledgePoint || ctx.knowledgePoint || ''
      const picked = pickCandidates(res.candidates, ctx.excludeIds ?? [], ctx.limit ?? 3)
      candidates.value = picked
      status.value = picked.length ? 'ready' : 'empty'
    } catch (err) {
      error.value = err
      status.value = 'error'
    }
  }

  function retry() {
    if (!lastCtx) return
    if (status.value === 'loading') return
    void load({ ...lastCtx, force: true })
  }

  /** 换题后彻底重置，避免看到上一题的候选 */
  function reset() {
    lastCtx = null
    status.value = 'idle'
    candidates.value = []
    error.value = null
    note.value = ''
    fromFallback.value = false
    knowledgePoint.value = ''
  }

  return {
    status,
    candidates,
    error,
    note,
    fromFallback,
    knowledgePoint,
    loading,
    isEmpty,
    isError,
    load,
    retry,
    reset
  }
}
