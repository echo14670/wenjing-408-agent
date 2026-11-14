/** 搜题、答疑与共享历史；所有请求保留用户原题。 */
import { computed, ref } from 'vue'
import { searchQuestion, sendChat } from '@/api/endpoints'
import { normalizeSearch } from '@/api/normalize'
import { resolvePracticeQuestion } from '@/api/practice'
import { useSessionStore } from '@/store/session'
import { useHistoryStore } from '@/store/history'
import { useSearchStore } from '@/store/search'
import { useWjHistoryStore } from '@/store/wjHistory'
import { useWjMaterialsStore } from '@/store/wjMaterials'
import { useUiStore } from '@/store/ui'
import { useMockStore, isDemoMode } from '@/store/mock'
import { useWjPracticeStore } from '@/store/wjPractice'
import { stripAnswerLeak, detectConflict } from '@/utils/claims'
import { buildIsolationAudit } from '@/utils/practice'
let sequence = 0
export function useAnswerFlow() {
  const session = useSessionStore()
  const baseHistory = useHistoryStore()
  const history = useWjHistoryStore()
  const search = useSearchStore()
  const materials = useWjMaterialsStore()
  const ui = useUiStore()
  const mock = useMockStore()
  const practice = useWjPracticeStore()
  const inDemoMode = computed(() => isDemoMode(mock.mode) || ui.scenario !== 'auto')
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
  function setPracticeMode(mode) {
    session.setMode(mode)
    persist()
  }
  async function requestChat(mySeq, demoReply = '') {
    const mode = session.mode
    const hintOnly = mode === 'guided' && session.answerCollapsed
    session.chatStatus = 'loading'
    session.chatError = null
    persist()
    try {
      const reply = await sendChat({
        session_messages: buildSessionMessages(),
        question_id: session.isOriginal ? session.question?.questionId ?? null : null,
        user_answer: session.myThought, mode,
        context_chunks: ensureContext(session.rawInput)
      }, { scenario: ui.scenario })
      if (mySeq !== sequence) return false
      const content = demoReply || reply.reply
      const text = hintOnly ? stripAnswerLeak(content, session.question?.answer ?? '') : content
      session.lastReply = { ...reply, reply: text, toolResult: hintOnly ? '' : reply.toolResult }
      session.addMessage({ role: 'assistant', content: text,
        kind: hintOnly ? 'hint' : 'final', citations: reply.citations.map(c => c.text) })
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
  function matchesSource(result, scenario) {
    const demo = scenario !== 'auto' || isDemoMode(mock.mode) || mock.mode === 'apifox'
    return !result || Boolean(result.fromMockFallback) === demo
  }
  function restore(cached, mode = cached.mode) {
    history.setCurrent(cached)
    session.reset()
    session.setMode(mode)
    session.rawInput = cached.stem
    session.historyId = cached.id
    session.messages = cached.messages
    session.myThought = cached.userThought
    session.result = cached.result
    session.lastReply = cached.lastReply
    session.answerRevealed = cached.answerRevealed
    session.status = statusOf(cached.result)
    const unfinished = ['error', 'timeout', 'loading'].includes(cached.chatStatus) ||
      cached.messages.at(-1)?.role === 'user' ||
      (cached.result.fromPractice && !cached.messages.length && cached.chatStatus !== 'success')
    session.chatStatus = unfinished ? (cached.chatStatus === 'timeout' ? 'timeout' : 'error') : 'success'
    session.chatError = unfinished
      ? cached.chatError ?? { kind: 'unknown', code: 'INCOMPLETE', message: '上次答疑尚未完成，请重试' }
      : null
    session.restoredFromHistory = true
    ensureContext(cached.stem)
  }
  function restorePractice(questionId, { sessionId, mode }) {
    if (session.status === 'success' && session.result?.fromPractice && session.questionId === questionId &&
        (!sessionId || sessionId === session.historyId) && matchesSource(session.result, ui.scenario)) {
      if (session.mode !== mode) setPracticeMode(mode)
      return true
    }
    const matches = record => record?.result?.fromPractice && record.questionId === questionId &&
      matchesSource(record.result, ui.scenario)
    const requested = history.getSession(sessionId)
    const cached = matches(requested) ? requested : history.index.find(matches)
    if (!cached) return false
    abort()
    restore(cached, mode)
    if (mode !== cached.mode) persist()
    return true
  }
  async function load(opts) {
    const mySeq = ++sequence
    practice.reset()
    const mode = opts.mode ?? session.mode
    const q = opts.q?.trim() ?? ''
    const scenario = opts.scenario ?? ui.scenario
    ui.setScenario(scenario, { remember: false })
    retryCount.value++
    const previous = baseHistory.sessions.find(s => s.session_id === opts.sessionId &&
      s.question_stem === q && matchesSource(s.result_snapshot, scenario))
    const current = baseHistory.currentSession
    const candidate = previous ?? (current?.question_stem === q && matchesSource(current.result_snapshot, scenario) ? current : null)
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
      if (cached?.stem === q && cached.result && matchesSource(cached.result, scenario) &&
          (cached.result.fromPractice || (cached.mode === mode && cached.messages.length))) {
        restore(cached, mode)
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
    if (!content || practice.switching || !session.canFollowUp) return false
    // 失败后再次发送同一草稿时复用已有用户消息。
    const last = session.messages.at(-1)
    if (!(session.chatError && last?.role === 'user' && last.content === content)) {
      session.addMessage({ role: 'user', content })
    }
    return requestChat(sequence)
  }
  /* ------------------------------------------------------------------ *
   * 同考点练习：切题
   * ------------------------------------------------------------------ *
   * 切题不是"再查一次题"，而是把同一份 session 换成新题。必须做到四件事：
   *   1. 旧请求作废 —— sequence++，迟到的 /chat 响应一律丢弃，否则旧题讲解会串到新题上；
   *   2. 旧状态清空 —— 切片、消息、工具结果、引用、揭示态、错误全部归零；
   *   3. 作答不带过 —— myThought 置空，新题从空白思路开始；
   *   4. 模式带过去 —— mode 取切换前的值，引导仍是引导，直接讲解仍是直接讲解。
   */
  function snapshotBeforeSwitch() {
    return {
      questionId: session.question?.questionId ?? null,
      stem: session.question?.stem ?? session.rawInput,
      mode: session.mode,
      chunks: session.contextChunks.length,
      tokens: session.chunkTokens,
      thought: session.myThought,
      messages: session.messages.filter(m => m.role === 'user' || m.role === 'assistant').length,
      toolResult: session.lastReply?.toolResult ?? null,
      citations: session.lastReply?.citations?.length ?? 0,
      answerRevealed: session.answerRevealed
    }
  }
  async function startPractice(candidate, opts = {}) {
    if (!candidate?.stem || practice.switching) return false
    const previousSequence = sequence
    const demo = inDemoMode.value
    const fromRealQuestion = session.isOriginal && !session.result.fromMockFallback
    const before = snapshotBeforeSwitch()
    practice.beginSwitch()
    practice.pending = candidate
    const pending = practice.pending
    const isCurrent = () => previousSequence === sequence && practice.pending === pending
    let question
    try {
      ({ question } = await resolvePracticeQuestion(candidate, { demo }))
    } catch (err) {
      if (isCurrent()) {
        session.error = err
        session.status = err.kind === 'timeout' ? 'timeout' : 'error'
        practice.failSwitch()
      }
      return false
    }
    if (!isCurrent()) return false

    const mySeq = ++sequence
    const mode = opts.mode ?? session.mode
    if (opts.recordNotice !== false) {
      if (!demo && fromRealQuestion && before.questionId !== question.questionId) {
        practice.markDone(before.questionId)
      }
      practice.recordSwitch({ from: before, mode, audit: buildIsolationAudit(before) })
    }
    if (!demo) practice.rememberCandidate(candidate)
    session.reset()
    session.rawInput = candidate.stem
    session.myThought = ''
    session.setMode(mode)
    session.result = {
      matchType: 'original',
      question,
      similar: [],
      empty: false,
      patchedFields: demo ? ['practice.question'] : [],
      fromMockFallback: demo,
      fromPractice: true,
      practiceReason: candidate.reason ?? null,
      practiceMeta: {
        knowledgePoints: candidate.knowledgePoints ?? [],
        difficulty: candidate.difficulty ?? null,
        scope: candidate.scope ?? null
      }
    }
    session.status = 'success'
    practice.completeSwitch({ questionId: question.questionId, stem: question.stem, mode })
    practice.pending = null
    const demoReply = demo ? (mode === 'guided' ? candidate.guidedReply : candidate.directReply) : ''
    void requestChat(mySeq, demoReply)
    return true
  }
  async function retryChat() {
    if (practice.switching || session.chatStatus === 'loading') return false
    return requestChat(sequence)
  }
  function retry() {
    // 切题失败时，"重试"应当重试切题，而不是退回关键词检索
    if (practice.pending) return startPractice(practice.pending, { recordNotice: false })
    return load({ q: session.rawInput, thought: session.myThought, mode: session.mode,
      sessionId: session.historyId, scenario: ui.scenario, forceReload: true })
  }
  function ensure(opts) {
    const mode = opts.mode ?? session.mode
    if (!opts.forceReload && session.result && session.rawInput === opts.q && session.mode === mode &&
        matchesSource(session.result, opts.scenario ?? ui.scenario) &&
        (!opts.sessionId || opts.sessionId === session.historyId) &&
        ['success', 'similar', 'miss', 'empty'].includes(session.status)) return Promise.resolve()
    return load(opts)
  }
  function abort() {
    sequence++
    practice.reset()
  }
  return { isLoading, isChatting, chatFailure, conflictClaims, retryCount, inDemoMode,
    load, ensure, retry, retryChat, followUp, startPractice, restorePractice, setPracticeMode,
    ensureContext, revealAnswer }
}
