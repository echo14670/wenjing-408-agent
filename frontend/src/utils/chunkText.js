/**
 * 长文本切片工具（核心逻辑 #3）
 *
 * 用途：个人资料（PDF/课件/笔记）在「前端无状态切片」原则下，由前端切成长度可控的
 * 文本块（context_chunks），随 /api/chat 请求透传，后端只做拼装，不落库（见开发基准·业务底线 #4）。
 *
 * 策略：
 *  - 优先按段落边界聚合，尽量保持语义完整；
 *  - 单个超长段落按字符窗口切分，相邻窗口保留 overlap 保证上下文连续；
 *  - 默认单块上限 800 字符、重叠 80 字符（可按模型上下文能力调整）。
 */

export const DEFAULT_OPTIONS = {
  maxLength: 800,
  overlap: 80,
  minChunk: 120
}

/** 按段落聚合 + 超长段落窗口切分，返回字符串块数组 */
export function chunkText(text, options = {}) {
  const { maxLength, overlap, minChunk } = { ...DEFAULT_OPTIONS, ...options }
  if (!text || typeof text !== 'string') return []
  if (text.trim().length <= maxLength) {
    const t = text.trim()
    return t ? [t] : []
  }

  const paragraphs = text
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks = []
  let buffer = ''

  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim())
    buffer = ''
  }

  for (const para of paragraphs) {
    if (para.length > maxLength) {
      // 超长段落：字符窗口切分（带 overlap）
      flush()
      let start = 0
      while (start < para.length) {
        chunks.push(para.slice(start, start + maxLength))
        if (start + maxLength >= para.length) break
        start += maxLength - overlap
      }
      continue
    }

    const next = buffer ? `${buffer}\n${para}` : para
    if (next.length > maxLength) {
      flush()
      buffer = para
    } else {
      buffer = next
    }
  }
  flush()

  // 过滤过小的残余块（除非整段本身就很短）
  return chunks.filter((c) => c.length >= minChunk || paragraphs.length === 1)
}

/** 对一段原始文本做切片并编号（存入个人资料库用） */
export function chunkMaterial(materialId, text, options = {}) {
  const parts = chunkText(text, options)
  return parts.map((part, index) => ({
    chunk_id: `${materialId}_${index + 1}`,
    order: index + 1,
    text: part
  }))
}

/**
 * 汇总多份资料的切片 → context_chunks（string[]）
 * @param {Array<{chunks: Array<{text:string}>}>} materials 个人资料条目
 * @param {number} maxChunks 最多携带的块数（超出取最新的）
 */
export function buildContextChunks(materials, maxChunks = 20) {
  const flat = []
  for (const m of materials || []) {
    for (const c of m.chunks || []) {
      flat.push({ text: c.text, mtime: m.updated_at || m.created_at || 0 })
    }
  }
  flat.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
  return flat.slice(0, maxChunks).map((c) => c.text)
}
