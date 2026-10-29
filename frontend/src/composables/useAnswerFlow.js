/**
 * 答案页编排：检索 → 归一化兜底 → 对话 → 落本地历史。
 *
 * 关键取舍：
 *   检索成功、对话失败时，不把整页打成错误态——题目与来源仍然有价值，
 *   只是把"讲解加载失败"降级成一条可重试的提示。这是产品上更合理的行为。
 */
import { computed, ref } from 'vue'
import { searchQuestion, sendChat } from '@/api/endpoints'
import { useSessionStore } from '@/store/session'
import { useWjHistoryStore } from '@/store/wjHistory'
import { useWjMaterialsStore } from '@/store/wjMaterials'
import { useUiStore } from '@/store/ui'
import { stripAnswerLeak, detectConflict } from '@/utils/claims'
import { clip } from '@/utils/format'
export function useAnswerFlow() {
  const session = useSessionStore()
  const history = useWjHistoryStore()
  const materials = useWjMaterialsStore()
  const ui = useUiStore()
  /** 自增序号：旧请求回来时直接丢弃，避免快速切场景时串数据 */
  let seq = 0
  const retryCount = ref(0)
  const chatFailure = ref(null)
  /** 模型讲解与题库答案的冲突项 */
  const conflictClaims = ref([])
  const isLoading = computed(() => session.status === 'loading')
  const isChatting = computed(() => session.chatStatus === 'loading')
  function statusOf(result) {
    if (result.empty) return 'empty'
    if (result.matchType === 'similar') return 'similar'
    if (result.matchType === 'miss' || result.matchType === 'unknown') return 'miss'
    return 'success'
  }
  /** 保证有可发送的 context_chunks：没有本地资料时用内置示例资料兜底 */
  function ensureContext(query) {
    if (!materials.items.length) materials.importSample()
    const chunks = materials.contextFor(query)
    session.contextChunks = chunks
    session.chunkTokens = materials.tokensOf(chunks)
    return chunks
  }
  function buildSessionMessages() {
    // 契约要求近 3 轮，避免把整段历史都塞进 Prompt
    return session.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }))
  }
  function applyReply(reply, mode, mySeq) {
    if (mySeq !== seq) return
    session.lastReply = reply
    const text = mode === 'guided' ? stripAnswerLeak(reply.reply, session.question?.answer ?? '') : reply.reply
    // 引导模式防泄底：内容被替换过就在气泡上标注出来
    const leaked = text !== reply.reply
    session.addMessage({
      role: 'assistant',
      content: text,
      kind: mode === 'guided' ? 'hint' : 'final',
      citations: reply.citations.map((c) => c.text)
    })
    // 冲突检测：模型讲解与题库答案结论不一致时必须同屏展示差异（不覆盖原答案）
    if (session.question?.answer) {
      const diffs = detectConflict(session.question.answer, reply.reply)
      conflictClaims.value = diffs.map((d) => d.raw)
    }
    if (leaked) ui.toast('引导模式已隐藏最终结论，请先自己作答', 'info')
  }
  async function load(opts) {
    const mySeq = ++seq
    const mode = opts.mode ?? session.mode
    const scenario = opts.scenario ?? ui.scenario
    session.setMode(mode)
    session.rawInput = opts.q
    if (opts.thought !== undefined) session.myThought = opts.thought
    session.error = null
    session.chatError = null
    chatFailure.value = null
    conflictClaims.value = []
    retryCount.value += 1
    /* 0. 历史恢复：同一道题不必重新请求 */
    if (opts.allowRestore && !opts.forceReload) {
      const cached = history.findByQuestion(cacheKeyOf(opts.q))
      if (cached && cached.messages.length) {
        history.setCurrent(cached)
        session.messages = [...cached.messages]
        session.restoredFromHistory = true
        history.reloadedNotice = true
        ui.toast('已从本地历史恢复上次的答疑记录', 'info')
        return
      }
    }
    session.restoredFromHistory = false
    session.messages = []
    session.status = 'loading'
    /* 1. 检索 */
    let result
    try {
      result = await searchQuestion({ raw_input: opts.q, input_type: 'text' }, { scenario })
    } catch (err) {
      if (mySeq !== seq) return
      const appErr = err
      session.error = appErr
      session.status = appErr.kind === 'timeout' ? 'timeout' : 'error'
      return
    }
    if (mySeq !== seq) return
    session.result = result
    session.status = statusOf(result)
    if (result.fromMockFallback && result.patchedFields.length) {
      ui.toast('Mock 返回占位文本，已按示例内容兜底渲染', 'warn')
    }
    /* 2. 对话：相似题不进入追问流程，因此不发 chat */
    if (result.matchType !== 'similar' && !result.empty) {
      session.chatStatus = 'loading'
      const chunks = ensureContext(opts.q)
      try {
        const reply = await sendChat(
          {
            session_messages: buildSessionMessages(),
            question_id: result.question?.questionId ?? null,
            user_answer: session.myThought,
            mode,
            context_chunks: chunks
          },
          { scenario }
        )
        if (mySeq !== seq) return
        applyReply(reply, mode, mySeq)
        session.chatStatus = 'success'
      } catch (err) {
        if (mySeq !== seq) return
        const appErr = err
        chatFailure.value = appErr
        session.chatError = appErr
        session.chatStatus = appErr.kind === 'timeout' ? 'timeout' : 'error'
      }
    } else {
      session.chatStatus = 'idle'
    }
    /* 3. 落本地历史 */
    persist(mode)
  }
  function persist(mode) {
    const result = session.result
    if (!result) return
    const record = history.upsert({
      questionId: result.question?.questionId ?? cacheKeyOf(session.rawInput),
      matchType: result.matchType,
      subject: result.question?.subject ?? null,
      stem: result.question?.stem ?? session.rawInput,
      userThought: session.myThought,
      mode,
      messages: session.messages,
      chunkDigest: session.contextChunks.length
        ? {
            count: session.contextChunks.length,
            tokens: session.chunkTokens,
            headings: materials.items
              .flatMap((m) => m.chunks.map((c) => c.heading ?? ''))
              .filter(Boolean)
              .slice(0, 3)
          }
        : null
    })
    void record
  }
  /** 追问：追加一轮对话，不重新检索 */
  async function followUp(text) {
    const content = text.trim()
    if (!content || !session.canFollowUp) return false
    const mySeq = seq
    const mode = session.mode
    session.addMessage({ role: 'user', content, kind: undefined })
    session.chatStatus = 'loading'
    try {
      const reply = await sendChat(
        {
          session_messages: buildSessionMessages(),
          question_id: session.question?.questionId ?? null,
          user_answer: session.myThought,
          mode,
          context_chunks: session.contextChunks
        },
        { scenario: ui.scenario }
      )
      if (mySeq !== seq) return false
      applyReply(reply, mode, mySeq)
      session.chatStatus = 'success'
      persist(mode)
      return true
    } catch (err) {
      if (mySeq !== seq) return false
      const appErr = err
      session.chatError = appErr
      session.chatStatus = appErr.kind === 'timeout' ? 'timeout' : 'error'
      return false
    }
  }
  function retry() {
    return load({
      q: session.rawInput,
      thought: session.myThought,
      mode: session.mode,
      scenario: ui.scenario,
      forceReload: true
    })
  }
  /** 页面间跳转复用已有结果，避免同一道题重复请求 */
  function isFresh(q, mode) {
    return (
      !!session.result &&
      session.rawInput === q &&
      session.mode === mode &&
      ['success', 'similar', 'miss', 'empty'].includes(session.status)
    )
  }
  async function ensure(opts) {
    const mode = opts.mode ?? session.mode
    if (!opts.forceReload && isFresh(opts.q, mode)) {
      session.setMode(mode)
      return
    }
    await load(opts)
  }
  /** 只重试对话部分（检索已成功时用） */
  async function retryChat() {
    const mySeq = seq
    const mode = session.mode
    session.chatStatus = 'loading'
    session.chatError = null
    try {
      const reply = await sendChat(
        {
          session_messages: buildSessionMessages(),
          question_id: session.question?.questionId ?? null,
          user_answer: session.myThought,
          mode,
          context_chunks: session.contextChunks
        },
        { scenario: ui.scenario }
      )
      if (mySeq !== seq) return
      applyReply(reply, mode, mySeq)
      session.chatStatus = 'success'
      chatFailure.value = null
    } catch (err) {
      if (mySeq !== seq) return
      const appErr = err
      session.chatError = appErr
      chatFailure.value = appErr
      session.chatStatus = appErr.kind === 'timeout' ? 'timeout' : 'error'
    }
  }
  /** 中断进行中的请求（切场景/离开页面） */
  function abort() {
    seq += 1
  }
  return {
    isLoading,
    isChatting,
    chatFailure,
    conflictClaims,
    retryCount,
    load,
    ensure,
    retry,
    retryChat,
    followUp,
    abort,
    ensureContext
  }
}
/** 历史查找用：把输入压成稳定的 key */
function cacheKeyOf(input) {
  return clip(input.replace(/\s+/g, ' ').trim(), 60)
}
