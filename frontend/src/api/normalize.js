import {
  asNullableString,
  asString,
  asStringArray,
  isMeaningfulObject,
  normalizeReviewState,
  normalizeSimilar
} from './guards'
/* ------------------------------------------------------------------ *
 * match_type 归一化
 * ------------------------------------------------------------------ */
const ORIGINAL_KEYS = [
  'original',
  'origin',
  'exact',
  'exact_match',
  'exactmatch',
  'hit',
  '原题',
  '原题命中',
  '精确命中',
  '题库命中'
]
const SIMILAR_KEYS = ['similar', 'analog', 'related', 'similar_question', '相似', '相似题', '类似题', '类似']
const MISS_KEYS = [
  'miss',
  'not_found',
  'notfound',
  'none',
  'no_result',
  'empty',
  '未命中',
  '无结果',
  '未找到',
  '没找到'
]
function matchByKeyword(raw) {
  const s = raw.toLowerCase().replace(/[\s_-]/g, '')
  if (!s) return null
  const hit = (keys) => keys.some((k) => s === k.replace(/[\s_-]/g, ''))
  const contains = (keys) => keys.some((k) => s.includes(k.replace(/[\s_-]/g, '')))
  if (hit(ORIGINAL_KEYS)) return 'original'
  if (hit(SIMILAR_KEYS)) return 'similar'
  if (hit(MISS_KEYS)) return 'miss'
  if (contains(ORIGINAL_KEYS)) return 'original'
  if (contains(SIMILAR_KEYS)) return 'similar'
  if (contains(MISS_KEYS)) return 'miss'
  return null
}
/**
 * 归一化 match_type，共 5 步（先命中先返回）：
 *   1. 关键词精确匹配（含中文枚举）
 *   2. 关键词包含匹配（应对随机串里混入关键词）
 *   3. 结构推断：question_data 有题干 → original
 *   4. 结构推断：question_data 空但相似题非空 → similar
 *   5. 两者皆空 → miss；仍有数据对不上 → unknown（按 miss 渲染并加灰标）
 */
export function normalizeMatchType(raw, question, similarCount) {
  const rawStr = asString(raw).trim()
  if (rawStr) {
    const byKeyword = matchByKeyword(rawStr)
    if (byKeyword) return byKeyword
  }
  // 结构推断：以"能渲染出什么"为准，而不是以"字段叫什么"为准
  if (question && question.stem.trim()) {
    // 空壳题：有对象但题干/答案都空，且有相似题 → 视为相似题
    if (!question.answer.trim() && similarCount > 0) return 'similar'
    return 'original'
  }
  if (similarCount > 0) return 'similar'
  if (rawStr) return 'unknown'
  return 'miss'
}
/* ------------------------------------------------------------------ *
 * 题目对象
 * ------------------------------------------------------------------ */
export function normalizeQuestion(raw) {
  if (!isMeaningfulObject(raw)) return null
  const q = raw
  return {
    questionId: asNullableString(q.question_id),
    subject: asNullableString(q.subject),
    stem: asString(q.stem),
    answer: asString(q.answer),
    solution: asString(q.solution) || asString(q.explanation),
    sourceRef: asNullableString(q.source_ref),
    reviewState: normalizeReviewState(q.review_state)
  }
}
/* ------------------------------------------------------------------ *
 * 搜索响应
 * ------------------------------------------------------------------ */
export function normalizeSearch(raw) {
  const payload = raw ?? {}
  const question = normalizeQuestion(payload.question_data ?? null)
  const similar = normalizeSimilar(payload.similar_questions)
  const rawMatchType = asNullableString(payload.match_type)
  const matchType = ['original', 'similar', 'miss'].includes(rawMatchType) ? rawMatchType : 'unknown'
  return {
    matchType,
    rawMatchType,
    question: matchType === 'original' ? question : null,
    similar: matchType === 'similar' ? similar : [],
    empty: matchType === 'original' ? !question : matchType === 'similar' ? similar.length === 0 : matchType === 'unknown',
    patchedFields: [],
    fromMockFallback: false
  }
}
/* ------------------------------------------------------------------ *
 * 对话响应
 * ------------------------------------------------------------------ */
export function normalizeChat(raw) {
  const payload = raw ?? {}
  const citations = asStringArray(payload.citations).map((text) => ({ text, sample: false }))
  return {
    reply: asString(payload.reply),
    toolResult: asNullableString(payload.tool_result),
    citations,
    patchedFields: []
  }
}
/* ------------------------------------------------------------------ *
 * 上传响应
 * ------------------------------------------------------------------ */
export function normalizeUpload(raw) {
  const payload = raw ?? {}
  return {
    taskId: asNullableString(payload.task_id),
    extractedText: asString(payload.extracted_text),
    failures: asStringArray(payload.failure_details)
  }
}
