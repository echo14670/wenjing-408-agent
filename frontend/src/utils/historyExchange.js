/** 统一历史字段与 v1 备份交换；不访问存储，预览不产生写入。 */
export const HISTORY_FORMAT = 'wenjing-history'
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value))
const text = value => typeof value === 'string' ? value : ''
function pick(raw, keys, fallback) {
  for (const key of keys) if (raw[key] !== undefined) return raw[key]
  return fallback
}
function date(value, fallback) {
  if (value == null || value === '') return fallback
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback
}

export function normalizeHistorySession(raw, previous = {}) {
  if (!object(raw)) throw new Error('会话不是有效对象')
  const id = pick(raw, ['session_id', 'sessionId', 'id'], previous.session_id)
  if (typeof id !== 'string' || !id.trim()) throw new Error('缺少有效会话 ID')
  const mode = pick(raw, ['mode'], previous.mode ?? 'guided')
  if (!['direct', 'guided'].includes(mode)) throw new Error('教学模式无效')
  const messages = pick(raw, ['messages'], previous.messages ?? [])
  if (!Array.isArray(messages) || messages.some(m => !object(m) ||
      !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) {
    throw new Error('消息必须包含有效 role 和文本 content')
  }
  const attempt = object(raw.answer_attempt) ? raw.answer_attempt : {}
  const legacyAttempt = object(raw.attempt) ? raw.attempt : {}
  const stem = text(pick(raw, ['question_stem', 'stem'], previous.question_stem ?? ''))
  const created = date(pick(raw, ['created_at', 'createdAt'], previous.created_at), '1970-01-01T00:00:00.000Z')
  return {
    session_id: id.trim(),
    question_id: pick(raw, ['question_id', 'questionId'], previous.question_id ?? null),
    question_stem: stem,
    title: text(pick(raw, ['title', 'stemSummary'], stem.slice(0, 24) || previous.title || '未命名提问')),
    mode,
    match_type: text(pick(raw, ['match_type', 'matchType'], previous.match_type ?? '')),
    answer_attempt: {
      user_answer: text(pick(attempt, ['user_answer'], pick(raw, ['userThought', 'userAnswerDigest'],
        legacyAttempt.userAnswer ?? previous.answer_attempt?.user_answer ?? ''))),
      user_reasoning: text(pick(attempt, ['user_reasoning'], pick(raw, ['userReasoning'],
        previous.answer_attempt?.user_reasoning ?? '')))
    },
    answer_revealed: pick(raw, ['answer_revealed', 'answerRevealed'],
      legacyAttempt.referenceExposed ?? previous.answer_revealed ?? false) === true,
    messages: messages.map((m, i) => ({
      message_id: text(m.message_id ?? m.id) || `${id}-m${i}`,
      role: m.role, content: m.content,
      kind: text(m.kind) || (mode === 'direct' ? 'final' : 'hint'),
      created_at: date(m.created_at ?? m.createdAt, created),
      model_source: m.model_source ?? null,
      citations: Array.isArray(m.citations) ? copy(m.citations) : [],
      tool_result: text(m.tool_result)
    })),
    result_snapshot: copy(pick(raw, ['result_snapshot', 'result'], previous.result_snapshot ?? null)),
    last_reply: copy(pick(raw, ['last_reply', 'lastReply'], previous.last_reply ?? null)),
    chat_status: text(pick(raw, ['chat_status', 'chatStatus'], previous.chat_status ?? 'idle')),
    chat_error: copy(pick(raw, ['chat_error', 'chatError'], previous.chat_error ?? null)),
    created_at: created,
    updated_at: date(pick(raw, ['updated_at', 'updatedAt'], previous.updated_at), created),
    // 早期 wj 备份只存摘要，不能把截断的摘要伪装成完整原题。
    legacy_incomplete: !stem.trim()
  }
}

export function historyView(session) {
  if (!session) return null
  const s = copy(session)
  return {
    id: s.session_id, questionId: s.question_id, stem: s.question_stem,
    stemSummary: s.title, mode: s.mode, matchType: s.match_type,
    userThought: s.answer_attempt?.user_answer ?? '',
    userReasoning: s.answer_attempt?.user_reasoning ?? '',
    messages: s.messages.map(m => ({ ...m, id: m.message_id })),
    result: s.result_snapshot, lastReply: s.last_reply,
    chatStatus: s.chat_status, chatError: s.chat_error,
    answerRevealed: s.answer_revealed,
    createdAt: Date.parse(s.created_at), updatedAt: Date.parse(s.updated_at),
    messageCount: s.messages.length
  }
}

export function previewHistoryImport(input, existing = []) {
  let data
  try { data = typeof input === 'string' ? JSON.parse(input) : input } catch {
    throw new Error('文件损坏：不是合法的 JSON')
  }
  if (!object(data) || !Array.isArray(data.sessions)) throw new Error('文件格式不正确：缺少 sessions 数组')
  if (data.version !== undefined && data.version !== 1) throw new Error('不支持的历史备份版本，仅支持 version=1')
  if (data.format !== undefined && data.format !== HISTORY_FORMAT) throw new Error('不是问径历史备份')
  const ids = new Set(existing.map(s => s.session_id))
  const candidates = [], skipped = [], invalid = []
  data.sessions.forEach((raw, index) => {
    try {
      if (!Array.isArray(raw?.messages)) throw new Error('缺少 messages 数组')
      const session = normalizeHistorySession(raw)
      if (ids.has(session.session_id)) {
        skipped.push({ index, id: session.session_id, reason: '会话 ID 重复，保留已有记录' })
      } else {
        ids.add(session.session_id)
        candidates.push(session)
      }
    } catch (error) { invalid.push({ index, reason: error.message }) }
  })
  return { total: data.sessions.length, candidates, skipped, invalid }
}

export function historyExport(sessions) {
  return JSON.stringify({ format: HISTORY_FORMAT, version: 1,
    exported_at: new Date().toISOString(), sessions: sessions.map(s => normalizeHistorySession(s)) }, null, 2)
}
