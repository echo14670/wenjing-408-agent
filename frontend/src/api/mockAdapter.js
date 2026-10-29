import { cacheCase } from '@/mock/fixtures/cacheCase'
import { isPlaceholder } from '@/mock/garbage'
const SUBJECT = cacheCase.subject
function fixtureQuestion() {
  return {
    questionId: cacheCase.questionId,
    subject: SUBJECT,
    stem: cacheCase.stem,
    answer: cacheCase.answer,
    solution: cacheCase.directReply,
    sourceRef: '计算机组成原理 · Cache 地址划分',
    reviewState: 'unverified'
  }
}
function fixtureSimilar() {
  return cacheCase.similar.map((text, i) => ({ id: `S${i + 1}`, text, similarity: null }))
}
/* ------------------------------------------------------------------ *
 * 搜索响应
 * ------------------------------------------------------------------ */
export function enrichSearch(input, scenario = 'auto') {
  const result = { ...input, similar: [...input.similar], patchedFields: [...input.patchedFields] }
  const patched = []
  const mark = (field) => {
    if (!patched.includes(field)) patched.push(field)
  }
  /* ---------- 1. 场景覆盖（结构层） ---------- */
  if (scenario === 'original' || scenario === 'conflict') {
    result.matchType = 'original'
    result.question = fixtureQuestion()
    result.similar = fixtureSimilar()
    result.empty = false
  } else if (scenario === 'similar') {
    result.matchType = 'similar'
    result.question = null
    result.similar = fixtureSimilar()
    result.empty = false
  } else if (scenario === 'miss') {
    result.matchType = 'miss'
    result.question = null
    result.similar = []
    result.empty = false
  } else if (scenario === 'empty') {
    result.matchType = 'miss'
    result.question = null
    result.similar = []
    result.empty = true
    mark('scenario:empty')
  }
  /* ---------- 2. 文案兜底（字段层） ---------- */
  if (result.question) {
    const q = result.question
    if (!q.stem.trim() || isPlaceholder(q.stem)) {
      q.stem = cacheCase.stem
      mark('question_data.stem')
    }
    if (!q.subject || isPlaceholder(q.subject)) {
      q.subject = SUBJECT
      mark('question_data.subject')
    }
    if (!q.answer.trim() || isPlaceholder(q.answer)) {
      q.answer = cacheCase.answer
      mark('question_data.answer')
    }
    if (q.solution.trim() && isPlaceholder(q.solution)) {
      q.solution = ''
      mark('question_data.solution')
    }
    if (!q.sourceRef || isPlaceholder(q.sourceRef)) {
      q.sourceRef = '计算机组成原理'
      mark('question_data.source_ref')
    }
    if (!q.questionId) {
      q.questionId = cacheCase.questionId
      mark('question_data.question_id')
    }
  } else if (result.matchType === 'original') {
    // 接口说命中了原题，却没给题目对象：按结构补一份，避免页面渲染出空白
    result.question = fixtureQuestion()
    mark('question_data(补全)')
  }
  if (result.similar.length) {
    result.similar = result.similar.map((item, i) => {
      if (isPlaceholder(item.text) || item.text.trim().length < 6) {
        mark('similar_questions')
        return {
          id: item.id ?? `S${i + 1}`,
          text: cacheCase.similar[i % cacheCase.similar.length],
          similarity: item.similarity
        }
      }
      return item
    })
  } else if (result.matchType === 'similar') {
    result.similar = fixtureSimilar()
    mark('similar_questions(补全)')
  }
  /* ---------- 3. 空态判定 ---------- */
  if (result.matchType === 'miss') result.empty = result.empty && scenario === 'empty'
  if (!result.question && !result.similar.length && result.matchType !== 'miss') result.empty = true
  result.patchedFields = Array.from(new Set([...result.patchedFields, ...patched]))
  result.fromMockFallback = result.patchedFields.length > 0
  return result
}
/* ------------------------------------------------------------------ *
 * 对话响应
 * ------------------------------------------------------------------ */
export function enrichChat(input, mode, scenario = 'auto') {
  const reply = { ...input, citations: [...input.citations], patchedFields: [...input.patchedFields] }
  const patched = []
  const mark = (field) => {
    if (!patched.includes(field)) patched.push(field)
  }
  if (scenario === 'conflict') {
    reply.reply = cacheCase.conflictReply
    mark('chat.reply(冲突场景)')
  } else if (!reply.reply.trim() || isPlaceholder(reply.reply)) {
    reply.reply = mode === 'guided' ? cacheCase.guidedReply : cacheCase.directReply
    mark('chat.reply')
  }
  if (!reply.toolResult || isPlaceholder(reply.toolResult)) {
    reply.toolResult = cacheCase.toolResult
    mark('chat.tool_result')
  }
  const usableCitations = reply.citations.filter((c) => !isPlaceholder(c.text))
  if (usableCitations.length !== reply.citations.length) {
    reply.citations = cacheCase.citations.map((text) => ({ text, sample: true }))
    mark('chat.citations')
  } else if (!usableCitations.length) {
    reply.citations = cacheCase.citations.map((text) => ({ text, sample: true }))
    mark('chat.citations(补全)')
  }
  reply.patchedFields = Array.from(new Set([...reply.patchedFields, ...patched]))
  return reply
}
/* ------------------------------------------------------------------ *
 * 上传响应
 * ------------------------------------------------------------------ */
export function enrichUpload(input) {
  const result = { ...input, failures: [...input.failures] }
  if (!result.extractedText.trim() || isPlaceholder(result.extractedText)) {
    result.extractedText = cacheCase.uploadText
  }
  if (result.failures.some((f) => isPlaceholder(f))) {
    result.failures = []
  }
  return result
}
/** 供开发面板展示：当前响应里哪些字段来自兜底 */
export function describePatches(fields) {
  return fields.length ? `已兜底 ${fields.length} 处：${fields.join('、')}` : '全部字段来自接口'
}
