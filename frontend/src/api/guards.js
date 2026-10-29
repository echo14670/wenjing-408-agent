export function asString(value, fallback = '') {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}
export function asNullableString(value) {
  const s = asString(value).trim()
  return s ? s : null
}
export function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}
export function asStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((v) => (typeof v === 'string' ? v : asString(v?.text))).filter(Boolean)
}
/** 相似题兼容 string[] 与 object[]，并统一成领域模型 */
export function normalizeSimilar(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    if (typeof item === 'string') {
      const text = item.trim()
      if (text) out.push({ id: null, text, similarity: null })
      continue
    }
    if (item && typeof item === 'object') {
      const text = asString(item.stem ?? item.title ?? item.question).trim()
      if (!text) continue
      out.push({
        id: asNullableString(item.question_id),
        text,
        similarity: asNumber(item.similarity)
      })
      continue
    }
    // 其它类型一律丢弃，但留痕方便排查契约漂移
    console.warn('[wj:contract] 无法识别的 similar_questions 元素', item)
  }
  return out
}
const REVIEW_ALIASES = {
  verified: 'verified',
  已核验: 'verified',
  unverified: 'unverified',
  待核验: 'unverified',
  pending: 'pending',
  待审核: 'pending'
}
/** 只认三种核验态，其余按待核验处理（宁可多提示，不谎称已核验） */
export function normalizeReviewState(value) {
  const s = asString(value).trim().toLowerCase()
  return REVIEW_ALIASES[s] ?? 'unverified'
}
/** 判断一个对象是否「有实际内容」，用于 question_data 空壳识别 */
export function isMeaningfulObject(value) {
  if (!value || typeof value !== 'object') return false
  return Object.values(value).some((v) => {
    if (typeof v === 'string') return v.trim().length > 0
    if (typeof v === 'number') return Number.isFinite(v)
    if (Array.isArray(v)) return v.length > 0
    return v !== null && v !== undefined
  })
}
