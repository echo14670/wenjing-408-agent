import {
  asNullableString,
  asNumber,
  asString,
  asStringArray,
  isMeaningfulObject,
  normalizeReviewState,
  normalizeSimilar
} from './guards.js'
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
    // chapter / options 是 /api/recommend 的 QuestionData 自带字段。
    // 推荐响应已经含完整题目，详情接口还没上线时不能把这两个丢掉（TD-06）。
    chapter: asNullableString(q.chapter),
    options: asStringArray(q.options),
    stem: asString(q.stem),
    answer: asString(q.answer),
    solution: asString(q.solution) || asString(q.explanation),
    sourceRef: asNullableString(q.source_ref),
    reviewState: normalizeReviewState(q.review_state),
    steps: normalizeSteps(q.steps ?? q.solution_steps ?? q.analysis_steps),
    hints: asStringArray(q.hints),
    segments: normalizeSegments(q.segments)
  }
}
/** 题库解析步骤：允许对象数组或纯字符串数组，缺字段一律降级而不是整条丢弃 */
function normalizeSteps(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item, i) => {
      if (typeof item === 'string') {
        const detail = item.trim()
        return detail ? { index: i + 1, title: `第 ${i + 1} 步`, formula: '', detail } : null
      }
      if (!item || typeof item !== 'object') return null
      const title = asString(item.title ?? item.name).trim()
      const detail = asString(item.detail ?? item.body ?? item.text).trim()
      if (!title && !detail) return null
      return {
        index: i + 1,
        title: title || `第 ${i + 1} 步`,
        formula: asString(item.formula),
        detail: detail || title
      }
    })
    .filter(Boolean)
}
/** 地址分段条：缺 bits 或 label 的项直接丢弃，避免画出长度为零的假分段 */
function normalizeSegments(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const label = asString(item.label).trim()
      const bits = asNumber(item.bits)
      if (!label || bits === null) return null
      return { label, bits, tone: asString(item.tone) || 'primary' }
    })
    .filter(Boolean)
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
 * 同考点推荐响应（POST /api/recommend）
 * ------------------------------------------------------------------ *
 * 后端已实现的正式契约（docs/api-contract.md §4）：
 *   { questions: QuestionData[], scope: "knowledge_point"|"chapter"|"none", notice: string }
 * `questions` 里每一项都是**完整题目**（含 answer / solution / options / chapter / review_state），
 * 因此前端不需要再依赖详情接口才能开始练习；详情只作为可选补充。
 *
 * 兼容键（candidates / recommendations / similar_questions / items）仅用于显式演示数据与旧样例，
 * 正式路径一律以 questions 为准。元素允许是字符串或对象，缺字段降级但不丢已有字段。
 */
export const RECOMMEND_SCOPES = ['knowledge_point', 'chapter', 'none']

function normalizeCandidate(item) {
  if (typeof item === 'string') {
    const stem = item.trim()
    return stem
      ? {
          id: null,
          subject: null,
          chapter: null,
          stem,
          options: [],
          answer: '',
          solution: '',
          sourceRef: null,
          reviewState: 'unverified',
          knowledgePoints: [],
          difficulty: null,
          reason: null
        }
      : null
  }
  if (!item || typeof item !== 'object') return null
  const stem = asString(item.stem ?? item.title ?? item.question).trim()
  if (!stem) return null
  return {
    id: asNullableString(item.question_id ?? item.id),
    subject: asNullableString(item.subject),
    chapter: asNullableString(item.chapter ?? item.chapterName),
    stem,
    options: asStringArray(item.options),
    answer: asString(item.answer),
    solution: asString(item.solution ?? item.explanation),
    sourceRef: asNullableString(item.source_ref ?? item.source),
    reviewState: normalizeReviewState(item.review_state ?? item.reviewState),
    knowledgePoints: asStringArray(item.knowledge_points ?? item.tags),
    difficulty: asNumber(item.difficulty),
    reason: asNullableString(item.reason)
  }
}
function normalizeScope(value) {
  const scope = asString(value).trim().toLowerCase()
  return RECOMMEND_SCOPES.includes(scope) ? scope : null
}
export function normalizeRecommend(raw) {
  const payload = raw?.data ?? raw ?? {}
  const list = payload.questions ?? payload.candidates ?? payload.recommendations ?? payload.similar_questions ?? payload.items ?? []
  const candidates = (Array.isArray(list) ? list : []).map(normalizeCandidate).filter(Boolean)
  return {
    knowledgePoint: asNullableString(payload.knowledge_point ?? payload.knowledgePoint),
    scope: normalizeScope(payload.scope),
    notice: asString(payload.notice),
    candidates
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
