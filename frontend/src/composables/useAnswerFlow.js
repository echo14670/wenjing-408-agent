/** 搜题、答疑与共享历史；所有请求保留用户原题。 */
import { computed, ref } from 'vue'
import { searchQuestion, sendChat } from '@/api/endpoints'
import { normalizeSearch } from '@/api/normalize'
import { useSessionStore } from '@/store/session'
import { useHistoryStore } from '@/store/history'
import { useSearchStore } from '@/store/search'
import { useWjHistoryStore } from '@/store/wjHistory'
import { useWjMaterialsStore } from '@/store/wjMaterials'
import { useUiStore } from '@/store/ui'
import { stripAnswerLeak, detectConflict } from '@/utils/claims'
let sequence = 0
export function useAnswerFlow() {
  const session = useSessionStore()
  const baseHistory = useHistoryStore()
  const history = useWjHistoryStore()
  const search = useSearchStore()
  const materials = useWjMaterialsStore()
  const ui = useUiStore()
  const retryCount = ref(0)
  const chatFailure = computed(() => session.chatError)
  const conflictClaims = computed(() => session.answerCollapsed ? [] :
    detectConflict(session.question?.answer ?? '', session.lastReply?.reply ?? '').map(d => d.raw))
  const isLoading = computed(() => session.status === 'loading')
  const isChatting = computed(() => session.chatStatus === 'loading')
  function statusOf(result) {
    if (result.empty) return 'empty'
    return result.matchType === 'original' ? 'success' : result.matchType === 'similar' ? 'similar' : 'miss'
  }
  function ensureContext(query) {
    const chunks = materials.contextFor(query)
    session.contextChunks = chunks
    session.chunkTokens = materials.tokensOf(chunks)
    return chunks
  }
  function buildSessionMessages() {
    const messages = [{ role: 'user', content: session.rawInput }]
    if (session.mode === 'guided' && session.answerRevealed) {
      messages.push({ role: 'user', content: '我已主动选择查看答案，可以结合完整答案继续讲解。' })
    }
    return messages.concat(session.messages.slice(-6).map(m => ({ role: m.role, content: m.content })))
  }
  function persist() {
    if (!session.result) return
    const record = history.upsert({
      sessionId: session.historyId,
      questionId: session.isOriginal ? session.question?.questionId ?? null : null,
      matchType: session.matchType, stem: session.rawInput, mode: session.mode,
      userThought: session.myThought, messages: session.messages,
      answerRevealed: session.answerRevealed, result: session.result, lastReply: session.lastReply,
      chatStatus: session.chatStatus, chatError: session.chatError
    })
    session.historyId = record.id
  }
  function revealAnswer() {
    session.answerRevealed = true
    persist()
  }
  async function requestChat(mySeq) {
    session.chatStatus = 'loading'
    session.chatError = null
    persist()
    try {
      const reply = await sendChat({
        session_messages: buildSessionMessages(),
        question_id: session.isOriginal ? session.question?.questionId ?? null : null,
        user_answer: session.myThought, mode: session.mode,
        context_chunks: ensureContext(session.rawInput)
      }, { scenario: ui.scenario })
      if (mySeq !== sequence) return false
      const text = session.answerCollapsed ? stripAnswerLeak(reply.reply, session.question?.answer ?? '') : reply.reply
      session.lastReply = session.answerCollapsed ? { ...reply, toolResult: '' } : reply
      session.addMessage({ role: 'assistant', content: text,
        kind: session.answerCollapsed ? 'hint' : 'final', citations: reply.citations.map(c => c.text) })
      session.chatStatus = 'success'
      persist()
      return true
    } catch (err) {
      if (mySeq !== sequence) return false
      session.chatError = err
      session.chatStatus = err.kind === 'timeout' ? 'timeout' : 'error'
      persist()
      return false
    }
  }
  async function load(opts) {
    const mySeq = ++sequence
    const mode = opts.mode ?? session.mode
    const q = opts.q?.trim() ?? ''
    const scenario = opts.scenario ?? ui.scenario
    ui.setScenario(scenario)
    retryCount.value++
    const previous = baseHistory.sessions.find(s => s.session_id === opts.sessionId && s.question_stem === q)
    const candidate = previous ?? (baseHistory.currentSession?.question_stem === q ? baseHistory.currentSession : null)
    const thought = opts.thought ?? candidate?.answer_attempt?.user_answer ?? ''
    session.reset()
    session.setMode(mode)
    session.rawInput = q
    session.myThought = thought
    session.historyId = candidate?.session_id ?? null
    session.messages = (candidate?.messages ?? []).map(m => ({ ...m, id: m.id ?? m.message_id,
      kind: m.kind ?? (candidate.mode === 'direct' ? 'final' : 'hint') }))
    if (!q) {
      session.status = 'empty'
      return
    }
    if (opts.allowRestore && !opts.forceReload && scenario === 'auto') {
      const cached = previous ? history.getSession(previous.session_id) : history.findByQuestion(q, mode)
      if (cached?.stem === q && cached.mode === mode && cached.result && cached.messages.length) {
        history.setCurrent(cached)
        session.historyId = cached.id
        session.messages = cached.messages
        session.myThought = cached.userThought
        session.result = cached.result
        session.lastReply = cached.lastReply
        session.answerRevealed = cached.answerRevealed
        session.status = statusOf(cached.result)
        const unfinished = ['error', 'timeout', 'loading'].includes(cached.chatStatus) || cached.messages.at(-1)?.role === 'user'
        session.chatStatus = unfinished ? (cached.chatStatus === 'timeout' ? 'timeout' : 'error') : 'success'
        session.chatError = unfinished ? cached.chatError ?? { kind: 'unknown', code: 'INCOMPLETE', message: '上次答疑尚未完成，请重试' } : null
        session.restoredFromHistory = true
        ensureContext(q)
        return
      }
    }
    session.answerRevealed = candidate?.answer_revealed === true
    session.status = 'loading'
    try {
      const canReuse = !opts.forceReload && scenario === 'auto' && candidate && search.query?.raw_input === q && search.result
      const result = canReuse ? normalizeSearch(search.result) :
        await searchQuestion({ raw_input: q, input_type: search.query?.raw_input === q ? search.query.input_type : 'text' }, { scenario })
      if (mySeq !== sequence) return
      if (canReuse) result.fromMockFallback = search.result.source === 'local-demo' || search.result.source === 'apifox-mock'
      session.result = result
      session.status = statusOf(result)
    } catch (err) {
      if (mySeq !== sequence) return
      session.error = err
      session.status = err.kind === 'timeout' ? 'timeout' : 'error'
      return
    }
    persist()
    if (!session.result.empty) await requestChat(mySeq)
  }
  async function followUp(text) {
    const content = text.trim()
    if (!content || !session.canFollowUp) return false
    // 失败后再次发送同一草稿时复用已有用户消息。
    const last = session.messages.at(-1)
    if (!(session.chatError && last?.role === 'user' && last.content === content)) {
      session.addMessage({ role: 'user', content })
    }
    return requestChat(sequence)
  }
  function retryChat() { return requestChat(sequence) }
  function retry() { return load({ q: session.rawInput, thought: session.myThought, mode: session.mode,
    sessionId: session.historyId, scenario: ui.scenario, forceReload: true }) }
  function ensure(opts) {
    const mode = opts.mode ?? session.mode
    if (!opts.forceReload && session.result && session.rawInput === opts.q && session.mode === mode &&
        (!opts.sessionId || opts.sessionId === session.historyId) &&
        ['success', 'similar', 'miss', 'empty'].includes(session.status)) return Promise.resolve()
    return load(opts)
  }
  function abort() { sequence++ }
  return { isLoading, isChatting, chatFailure, conflictClaims, retryCount,
    load, ensure, retry, retryChat, followUp, abort, ensureContext, revealAnswer }
}
