/**
 * 结论抽取：用于两条业务红线
 *   1) 冲突展示 —— 模型讲解与题库答案结论不一致时必须同屏展示差异，不能覆盖原答案；
 *   2) 引导不泄底 —— mode=guided 的初始回复里不能出现最终结论。
 *
 * 关键难点：不能按「任意数字 + 位」比大小。
 * 题干里的 "32 位地址" 是已知条件，模型复述它并不是冲突。
 * 因此冲突检测按「字段名 → 值」配对比较：只有同一个字段给出不同值才算冲突。
 */
const CLAIM_RE = /(\d+(?:\.\d+)?)\s*(位|字节|块|组|行|条|个)/g
/** 地址划分里常见的字段名，用来做"同名不同值"比对 */
const LABELS = ['块内偏移', '页内偏移', '组索引', '标记', '页号', '行号', 'tag', '索引', '偏移', '块号']
const LABELED_RE = new RegExp(`(${LABELS.join('|')})[^0-9\\n]{0,6}(\\d+(?:\\.\\d+)?)\\s*位`, 'gi')
export function extractClaims(text) {
  if (!text) return []
  const out = []
  const seen = new Set()
  for (const match of text.matchAll(CLAIM_RE)) {
    const value = match[1]
    const raw = match[0]
    const key = `${value}${match[2]}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ value, raw, label: null })
  }
  return out
}
export function extractBitClaims(text) {
  return extractClaims(text).filter((c) => c.raw.includes('位'))
}
/** 归一化字段名，把 tag → 标记、索引 → 组索引，便于跨表述比对 */
function canonicalLabel(label) {
  const l = label.toLowerCase()
  if (l === 'tag' || l === '标记') return '标记'
  if (l === '索引' || l === '组索引') return '组索引'
  if (l === '偏移' || l === '块内偏移') return '块内偏移'
  if (l === '页内偏移') return '页内偏移'
  if (l === '页号') return '页号'
  if (l === '行号') return '行号'
  return label
}
/** 抽出「字段名 + 位数」的配对结论，例如 标记 19 位 */
export function extractLabeledClaims(text) {
  if (!text) return []
  const out = []
  const seen = new Set()
  for (const match of text.matchAll(LABELED_RE)) {
    const label = canonicalLabel(match[1])
    const value = match[2]
    const key = `${label}:${value}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ value, raw: match[0].trim(), label })
  }
  return out
}
/**
 * 冲突检测：同一字段，题库给的值与模型给的值不同。
 *
 * 只做机械比对，不做语义理解；宁可少报也不要把"复述条件"误判成冲突
 * （例如把 32 位地址总长当成标记位数冲突，会天天误报）。
 */
export function detectConflict(questionAnswer, modelText) {
  const truth = extractLabeledClaims(questionAnswer)
  const model = extractLabeledClaims(modelText)
  if (!truth.length || !model.length) return []
  const truthMap = new Map(truth.map((c) => [c.label, c.value]))
  return model.filter((c) => {
    const t = truthMap.get(c.label)
    return t !== undefined && t !== c.value
  })
}
/**
 * 引导模式泄题拦截：把答案里的结论从文本中打码。
 *
 * 判定用启发式而非"见一个打一个"：分步提示本来就会给出中间量，
 * 逐个打码会把正常引导步骤也毁掉。所以只在「回复已同时给出多个最终结论、
 * 实质上把答案说完了」时才整体打码。
 */
export function stripAnswerLeak(text, answer) {
  const truth = extractLabeledClaims(answer)
  const fallback = truth.length ? truth : extractBitClaims(answer)
  if (!fallback.length || !text) return text
  const hit = fallback.filter((claim) => {
    const pattern = claim.label
      ? new RegExp(`${claim.label}[^0-9\\n]{0,6}${claim.value}\\s*位`)
      : new RegExp(`(?<!\\d)${claim.value}\\s*位`)
    return pattern.test(text)
  })
  const leaked = hit.length >= 2 && hit.length >= Math.ceil(fallback.length * 0.5)
  if (!leaked) return text
  let result = text
  for (const claim of fallback) {
    const pattern = claim.label
      ? new RegExp(`(${claim.label})([^0-9\\n]{0,6})${claim.value}(\\s*位)`, 'g')
      : new RegExp(`(?<!\\d)${claim.value}\\s*位`, 'g')
    result = claim.label ? result.replace(pattern, '$1$2____$3') : result.replace(pattern, '____')
  }
  return result
}
export function containsAnswerLeak(text, answer) {
  return stripAnswerLeak(text, answer) !== text
}
