import { cacheCase } from '@/mock/fixtures/cacheCase'
import { stripAnswerLeak } from '@/utils/claims'
const STEP_MARKERS = [
  /^\*\*第([一二三四五六七八九十\d]+)步[：:、.]?\*\*\s*(.*)$/,
  /^第([一二三四五六七八九十\d]+)步[：:、.]?\s*(.*)$/,
  /^(\d{1,2})[.、)]\s+(.*)$/,
  /^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.*)$/
]
function stripBold(text) {
  return text.replace(/\*\*/g, '').trim()
}
/** 从一段文本里抽出公式片段：优先 `code`，其次含等号的短句 */
function extractFormula(text) {
  const code = text.match(/`([^`]+)`/)
  if (code) return code[1].trim()
  const eq = text.match(/([0-9\s().÷×+\-−=／/]{3,}.*?=\s*[\d.]+)/)
  if (eq) return eq[1].trim()
  return ''
}
export function useStepParser() {
  /** 解析模型回复中的步骤；解析不到返回空数组 */
  function parse(reply) {
    if (!reply) return []
    const lines = reply.replace(/\r\n?/g, '\n').split('\n')
    const buckets = []
    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue
      let matched = false
      for (const re of STEP_MARKERS) {
        const m = line.match(re)
        if (!m) continue
        const rest = stripBold(m[2] ?? '')
        const [title, inline] = rest.split(/[：:]/)
        buckets.push({ title: (title || rest).trim(), body: inline ? [inline.trim()] : [] })
        matched = true
        break
      }
      if (matched) continue
      if (buckets.length) buckets[buckets.length - 1].body.push(line)
    }
    return buckets
      .filter((b) => b.title.length > 0 && b.title.length <= 40)
      .map((b, i) => {
        const detail = b.body.join(' ').replace(/\*\*/g, '').trim()
        return {
          index: i + 1,
          title: b.title,
          formula: extractFormula(detail || b.title),
          detail: detail || b.title,
          hint: '',
          source: 'model'
        }
      })
  }
  /** 题库核验解析的分步结构（Cache 案例） */
  function bankSteps() {
    return cacheCase.steps.map((s, i) => ({
      ...s,
      hint: cacheCase.hints[i] ?? '',
      source: 'bank'
    }))
  }
  /** 只有确实在算「地址字段划分」的题才画分段条，避免给所有题硬套图示 */
  function segmentsFor(stem) {
    const s = (stem ?? '').toLowerCase()
    const isAddressSplit = (s.includes('标记') || s.includes('tag')) && (s.includes('组索引') || s.includes('组相联'))
    return isAddressSplit ? cacheCase.segments : []
  }
  /**
   * 决定这一步用哪套结构。
   * - 原题命中：题库解析优先（核验过的推导更可信）
   * - 未命中：只有模型文本，解析不出来就用案例结构兜底
   * - 引导模式：正文要做泄题拦截
   */
  function stepsFor(matchType, reply, mode, answer = '') {
    const fromModel = parse(reply)
    let steps
    if (matchType === 'original') {
      steps = bankSteps()
    } else if (fromModel.length >= 2) {
      steps = fromModel
    } else {
      steps = bankSteps().map((s) => ({ ...s, source: 'model' }))
    }
    if (mode === 'guided') {
      steps = steps.map((s) => ({
        ...s,
        detail: stripAnswerLeak(s.detail, answer),
        formula: stripAnswerLeak(s.formula, answer)
      }))
    }
    return steps
  }
  return { parse, bankSteps, stepsFor, segmentsFor }
}
