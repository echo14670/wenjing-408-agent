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
  /**
   * 题面自带的分步解析（同考点练习题会带 steps）。
   * 只认题目自己的数据：后端没给就保持为空，绝不用内置案例结构替代真实解答。
   */
  function providedSteps(question) {
    if (!question?.steps?.length) return null
    return question.steps.map((s, i) => ({
      index: s.index ?? i + 1,
      title: s.title,
      formula: s.formula ?? '',
      detail: s.detail ?? '',
      hint: question.hints?.[i] ?? ''
    }))
  }
  /** 分段条同理：只画题目自带的分段，不套用案例 */
  function segmentsFor(stem, provided = null) {
    return Array.isArray(provided) && provided.length ? provided : []
  }
  function stepsFor(matchType, reply, mode, answer = '', question = null) {
    const provided = providedSteps(question)
    const source = provided ?? parse(reply)
    return source.map(step => mode === 'guided' ? { ...step,
      detail: stripAnswerLeak(step.detail, answer), formula: stripAnswerLeak(step.formula, answer)
    } : step)
  }
  return { parse, stepsFor, segmentsFor }
}
