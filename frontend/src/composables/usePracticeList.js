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
import { useMockStore, isDemoMode } from '@/store/mock'
import { useUiStore } from '@/store/ui'

export function usePracticeList() {
  const mock = useMockStore()
  const ui = useUiStore()
  const status = ref('idle')
  const candidates = ref([])
  const error = ref(null)
  const note = ref('')
  /** 是否来自显式演示模式（决定 UI 要不要打「示例数据」标） */
  const demo = ref(false)
  /** 后端返回的召回层级与提示，不能写死成「同考点」 */
  const scope = ref(null)
  const notice = ref('')
  const knowledgePoint = ref('')
  /** 只有用户显式切到演示模式，或 URL 带 ?mock= 场景时，才允许内置示例候选 */
  const isDemo = () => isDemoMode(mock.mode) || ui.scenario !== 'auto'
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
          doneQuestionIds: ctx.doneQuestionIds,
          chapter: ctx.chapter,
          knowledgePoint: ctx.knowledgePoint,
          subject: ctx.subject,
          limit: ctx.limit ?? 3,
          includeUnverified: ctx.includeUnverified === true
        },
        { variant: ctx.variant, demo: isDemo(), signal: ctx.signal }
      )
      if (lastCtx !== ctx) return // 期间又换了题，丢弃旧响应
      note.value = res.note ?? ''
      demo.value = Boolean(res.demo)
      scope.value = res.scope ?? null
      notice.value = res.notice ?? ''
      knowledgePoint.value = res.knowledgePoint || ctx.knowledgePoint || ''
      const picked = pickCandidates(res.candidates, ctx.excludeIds ?? [], ctx.limit ?? 3)
      candidates.value = picked
      status.value = picked.length ? 'ready' : 'empty'
    } catch (err) {
      if (lastCtx !== ctx) return
      // 真实路径的任何失败都如实呈现：不填示例、不改成空态
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
    demo.value = false
    scope.value = null
    notice.value = ''
    knowledgePoint.value = ''
  }

  return {
    status,
    candidates,
    error,
    note,
    demo,
    scope,
    notice,
    knowledgePoint,
    loading,
    isEmpty,
    isError,
    load,
    retry,
    reset
  }
}
