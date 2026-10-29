/**
 * 长文本切片 —— 个人资料在前端切片，随 /api/chat 以 context_chunks 发送。
 *
 * 为什么在前端切：
 *   业务红线要求「个人资料不上传后端数据库」，后端只做透传拼装，
 *   所以切片必须发生在浏览器里，源头是 /api/upload 返回的 extracted_text。
 *
 * 切分目标：
 *   1. 不切断句子、不切断公式、不切断英文单词与数字；
 *   2. 每片带章节标题，跨片时语义不丢失；
 *   3. 片间有重叠，避免答案正好落在切口上。
 */
// 用相对路径而非 @ 别名：本模块要能被 `node scripts/test-chunk-pro.mjs` 直接加载，
// 测试不依赖 vite 的别名解析（与 scripts/test-chunk.mjs 的做法保持一致）。
import { CHUNK_DEFAULTS, CONTEXT_DEFAULTS } from '../constants/limits.js'
/* ------------------------------------------------------------------ *
 * token 估算
 * ------------------------------------------------------------------ */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g
/** 中文按字、英文按 4 字符 ≈ 1 token，整体留 5% 余量 */
export function estimateTokens(text) {
  if (!text) return 0
  const cjk = (text.match(CJK_RE) ?? []).length
  const latin = text.length - cjk
  return Math.ceil((cjk + latin / 4) * 1.05)
}
/* ------------------------------------------------------------------ *
 * 规范化
 * ------------------------------------------------------------------ */
function normalize(input) {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
}
/* ------------------------------------------------------------------ *
 * 标题识别
 * ------------------------------------------------------------------ */
const HEADING_PATTERNS = [
  /^#{1,6}\s+\S/, // # Markdown 标题
  /^第[一二三四五六七八九十百千\d]+[章节講讲篇课]/, // 第 3 章 / 第二节
  /^\d+(\.\d+){0,3}[\s、.．]+\S/, // 3.2 Cache / 1、绪论
  /^[一二三四五六七八九十]+、\S/, // 一、存储系统
  /^\*\*[^*]+\*\*$/ // **粗体标题**
]
function looksLikeHeading(line) {
  const text = line.trim()
  if (!text || text.length > 60) return false
  return HEADING_PATTERNS.some((re) => re.test(text))
}
/** 去掉 Markdown 记号，保留「3.2」这类编号（引用出处时需要它） */
function cleanHeading(line) {
  return line
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
const CJK_ENDERS = new Set(['。', '！', '？', '；', '…'])
const ASCII_ENDERS = new Set(['.', '!', '?', ';'])
/** 句末常见的收尾引号/括号，遇到时把结束符一并吞进来 */
const TRAILING_MARKS = new Set(['”', '’', '"', "'", '）', ')', '】', ']', '》', '」', '』'])
/** 英文缩写，避免在 e.g. / etc. 后面误切 */
const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'dr', 'mr', 'mrs', 'ms', 'fig', 'no', 'al', 'ca', 'approx'])
function isDigit(ch) {
  return !!ch && ch >= '0' && ch <= '9'
}
/**
 * 按句末标点分句，同时把 $$...$$ 公式块视为不可切原子。
 * 返回的句子保留标点，且记录在原文中的偏移。
 */
function splitSentences(text) {
  const out = []
  let start = 0
  let i = 0
  const push = (end) => {
    const slice = text.slice(start, end)
    if (slice.trim()) out.push({ text: slice, start, end })
    start = end
  }
  while (i < text.length) {
    const ch = text[i]
    // 公式块整体跳过，内部不参与断句
    if (ch === '$' && text[i + 1] === '$') {
      const close = text.indexOf('$$', i + 2)
      i = close === -1 ? text.length : close + 2
      continue
    }
    if (CJK_ENDERS.has(ch)) {
      let end = i + 1
      while (end < text.length && TRAILING_MARKS.has(text[end])) end += 1
      push(end)
      i = end
      continue
    }
    if (ASCII_ENDERS.has(ch)) {
      const next = text[i + 1]
      const prev = text[i - 1]
      const isBreak = next === undefined || /\s/.test(next)
      // 小数点、版本号、缩写不算句末
      const isDecimal = ch === '.' && (isDigit(prev) || isDigit(next))
      let isAbbr = false
      if (ch === '.' && isBreak) {
        const word = (text.slice(Math.max(0, i - 6), i).match(/[A-Za-z.]+$/) ?? [''])[0].toLowerCase()
        isAbbr = ABBREVIATIONS.has(word) || /^[a-z]\.[a-z]$/.test(word)
      }
      if (isBreak && !isDecimal && !isAbbr) {
        let end = i + 1
        while (end < text.length && TRAILING_MARKS.has(text[end])) end += 1
        push(end)
        i = end
        continue
      }
    }
    i += 1
  }
  if (start < text.length) push(text.length)
  return out
}
/* ------------------------------------------------------------------ *
 * 超长句硬切
 * ------------------------------------------------------------------ */
const SOFT_BREAKS = new Set(['，', '、', '；', '：', ',', ';', ':', ' '])
/** 单个句子超过上限时切开；优先落在逗号等次级断点，其次避开单词与数字中间 */
function hardSplit(text, maxSize) {
  const parts = []
  let i = 0
  let guard = 0
  while (text.length - i > maxSize && guard < 10000) {
    guard += 1
    let cut = -1
    // 在后半段里从右往左找软断点，尽量切得饱满
    for (let j = i + maxSize; j > i + Math.floor(maxSize * 0.5); j -= 1) {
      if (SOFT_BREAKS.has(text[j - 1])) {
        cut = j
        break
      }
    }
    if (cut <= i) {
      cut = i + maxSize
      // 不切断英文单词/数字：最多回退 8 个字符
      let back = 0
      while (
        cut - i > maxSize - 8 &&
        back < 8 &&
        /[A-Za-z0-9.]/.test(text[cut - 1] ?? '') &&
        /[A-Za-z0-9]/.test(text[cut] ?? '')
      ) {
        cut -= 1
        back += 1
      }
      if (cut <= i) cut = i + maxSize
    }
    parts.push(text.slice(i, cut))
    i = cut
  }
  if (i < text.length) parts.push(text.slice(i))
  return parts
}
export function chunkTextPro(input, opts = {}) {
  const targetSize = opts.targetSize ?? CHUNK_DEFAULTS.targetSize
  const maxSize = Math.max(opts.maxSize ?? CHUNK_DEFAULTS.maxSize, 40)
  const minSize = Math.min(opts.minSize ?? CHUNK_DEFAULTS.minSize, maxSize)
  // 重叠不能超过目标长度的一半，否则会原地打转
  const overlap = Math.min(opts.overlap ?? CHUNK_DEFAULTS.overlap, Math.floor(targetSize / 2), maxSize - 1)
  const normalized = normalize(input ?? '')
  if (!normalized.trim()) return []
  /* 1) 按空行切块，并识别块首标题 */
  const blocks = normalized.split(/\n{2,}/)
  let currentHeading
  const pieces = []
  for (const rawBlock of blocks) {
    const block = rawBlock.trim()
    if (!block) continue
    const lines = block.split('\n')
    let body = block
    let heading = currentHeading
    if (looksLikeHeading(lines[0])) {
      currentHeading = cleanHeading(lines[0])
      heading = currentHeading
      body = lines.slice(1).join('\n').trim()
      // 只有标题没有正文：跳过，不产出空片
      if (!body) continue
    }
    /* 2) 分句 */
    const bodyOffset = normalized.indexOf(body, 0)
    const sentences = splitSentences(body)
    /* 3) 累积成片 */
    let buf = ''
    let bufStart = sentences[0]?.start ?? 0
    let bufEnd = bufStart
    const flush = () => {
      if (!buf.trim()) {
        buf = ''
        return
      }
      pieces.push({
        text: buf,
        heading,
        start: (bodyOffset >= 0 ? bodyOffset : 0) + bufStart,
        end: (bodyOffset >= 0 ? bodyOffset : 0) + bufEnd
      })
      buf = ''
    }
    /** 取 buf 末尾按句子边界对齐、长度接近 overlap 的片段 */
    const overlapTail = () => {
      if (overlap <= 0) return ''
      const tailSentences = splitSentences(buf)
      let tail = ''
      for (let k = tailSentences.length - 1; k >= 0; k -= 1) {
        const candidate = tailSentences[k].text + tail
        if (candidate.length > overlap * 2) break
        tail = candidate
        if (tail.length >= overlap) break
      }
      return tail.length >= overlap ? tail : ''
    }
    for (const sentence of sentences) {
      // 单句超长：先把已有缓冲封片，再硬切
      if (sentence.text.length > maxSize) {
        flush()
        const parts = hardSplit(sentence.text, maxSize)
        let cursor = sentence.start
        parts.forEach((part, idx) => {
          const isLast = idx === parts.length - 1
          if (isLast) {
            buf = part
            bufStart = cursor
            bufEnd = cursor + part.length
          } else {
            pieces.push({
              text: part,
              heading,
              start: (bodyOffset >= 0 ? bodyOffset : 0) + cursor,
              end: (bodyOffset >= 0 ? bodyOffset : 0) + cursor + part.length
            })
          }
          cursor += part.length
        })
        continue
      }
      if (!buf) {
        buf = sentence.text
        bufStart = sentence.start
        bufEnd = sentence.end
        continue
      }
      if (buf.length + sentence.text.length <= targetSize) {
        buf += sentence.text
        bufEnd = sentence.end
        continue
      }
      // 到目标长度：封片，并带上一段重叠。
      // 若"重叠 + 本句"会突破硬上限，则这次不带重叠（宁可少一点上下文，也不超预算）
      const carry = overlapTail()
      const candidate = carry + sentence.text
      flush()
      if (candidate.length <= maxSize) {
        buf = candidate
        bufStart = sentence.start - carry.length
      } else {
        buf = sentence.text
        bufStart = sentence.start
      }
      bufEnd = sentence.end
    }
    flush()
  }
  if (!pieces.length) return []
  /* 4) 末片过短则并入前片（合并后不得超过硬上限，宁可留一个短尾片） */
  const merged = []
  for (const piece of pieces) {
    const prev = merged[merged.length - 1]
    if (prev && piece.text.trim().length < minSize && prev.text.length + piece.text.length <= maxSize) {
      prev.text = prev.text + piece.text
      prev.end = piece.end
    } else {
      merged.push({ ...piece })
    }
  }
  /* 5) 输出 */
  return merged
    .filter((p) => p.text.trim().length > 0)
    .map((p, index) => {
      const content = opts.keepHeading && p.heading ? `【${p.heading}】${p.text}` : p.text
      return {
        id: `c${index}`,
        index,
        content,
        heading: p.heading,
        tokens: estimateTokens(content),
        start: p.start,
        end: p.end
      }
    })
}
/* ------------------------------------------------------------------ *
 * 上下文选取
 * ------------------------------------------------------------------ */
const STOPWORDS = new Set([
  '的',
  '是',
  '在',
  '了',
  '和',
  '与',
  '及',
  '或',
  '我',
  '你',
  '他',
  '它',
  '这',
  '那',
  '有',
  '个',
  '怎么',
  '怎样',
  '如何',
  '为什么',
  '什么',
  '请问',
  '一下',
  '可以',
  '需要',
  '应该',
  '是否',
  '那么',
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'to',
  'of',
  'in',
  'on',
  'and',
  'or',
  'how',
  'why',
  'what',
  'which',
  'do',
  'does',
  'should',
  'can'
])
/** 中文取 2-gram（相邻两字），英文取完整单词，去掉疑问词与虚词 */
function tokenizeQuery(query) {
  const tokens = new Set()
  const cleaned = (query ?? '').toLowerCase()
  for (const word of cleaned.match(/[a-z][a-z0-9+.#-]{1,}/g) ?? []) {
    if (!STOPWORDS.has(word) && word.length >= 2) tokens.add(word)
  }
  const cjkRuns = cleaned.match(/[\u4e00-\u9fff]+/g) ?? []
  for (const run of cjkRuns) {
    if (run.length === 1) {
      if (!STOPWORDS.has(run)) tokens.add(run)
      continue
    }
    for (let i = 0; i < run.length - 1; i += 1) {
      const gram = run.slice(i, i + 2)
      if (!STOPWORDS.has(gram)) tokens.add(gram)
    }
  }
  return Array.from(tokens).slice(0, 60)
}
/** 是否像一道需要计算的题（决定是否给"含数字/等号"的切片加分） */
const CALC_HINTS = ['位', '字节', '周期', '地址', '页', '帧', '指令', '带宽', '容量', '组', '块', '计算']
/**
 * 从切片池中挑出与 query 最相关的若干段，按 token 预算截断。
 * 保证返回非空（除非切片池本身为空）——后端对空数组的处理路径不同，不能让它走异常分支。
 */
export function selectContextChunks(chunks, query, opts = {}) {
  const topK = opts.topK ?? CONTEXT_DEFAULTS.topK
  const tokenBudget = opts.tokenBudget ?? CONTEXT_DEFAULTS.tokenBudget
  const minScore = opts.minScore ?? CONTEXT_DEFAULTS.minScore
  const pool = chunks.filter((c) => c.content.trim().length > 0)
  if (!pool.length) return []
  const tokens = tokenizeQuery(query)
  const wantsCalc = CALC_HINTS.some((h) => query.includes(h))
  const scored = pool.map((chunk, i) => {
    const haystack = `${chunk.heading ?? ''}\n${chunk.content}`.toLowerCase()
    let hit = 0
    let occurrences = 0
    for (const token of tokens) {
      if (haystack.includes(token)) {
        hit += 1
        occurrences += haystack.split(token).length - 1
      }
    }
    const headingHit = chunk.heading ? tokens.some((t) => chunk.heading.toLowerCase().includes(t)) : false
    let score = 0
    if (tokens.length) score += 2.0 * (hit / tokens.length)
    if (headingHit) score += 1.5
    score += 0.3 * Math.min(1, occurrences / 3)
    if (i < pool.length * 0.2) score += 0.2
    if (wantsCalc && /[0-9]/.test(chunk.content) && /[=＝]/.test(chunk.content)) score += 0.3
    return { chunk, score, order: i }
  })
  let picked = scored.filter((s) => s.score >= minScore).sort((a, b) => b.score - a.score)
  // 全被阈值过滤掉（例如 query 全是停用词）时兜底：按原文顺序取前 topK
  if (!picked.length) picked = scored.slice(0, topK)
  /* 预算截断 + 内容去重 + 相邻合并 */
  const seen = new Set()
  const budgeted = []
  let used = 0
  for (const item of picked) {
    if (budgeted.length >= topK) break
    const key = item.chunk.content.trim()
    if (seen.has(key)) continue
    const cost = item.chunk.tokens
    if (used + cost > tokenBudget && budgeted.length > 0) continue
    seen.add(key)
    budgeted.push({ chunk: item.chunk, order: item.order })
    used += cost
  }
  budgeted.sort((a, b) => a.order - b.order)
  // 相邻片合并，减少上下文碎片
  const merged = []
  for (const { chunk } of budgeted) {
    const prev = merged[merged.length - 1]
    if (prev && chunk.index === prev.index + 1 && prev.heading === chunk.heading) {
      const content = `${prev.content}${chunk.content}`
      merged[merged.length - 1] = {
        ...prev,
        content,
        end: chunk.end,
        tokens: estimateTokens(content)
      }
      continue
    }
    merged.push({ ...chunk })
  }
  return merged
}
/** 便捷方法：整段资料 → 直接可用作 context_chunks 的字符串数组 */
export function buildContextChunksPro(rawText, query, opts) {
  const chunks = chunkTextPro(rawText, { keepHeading: true })
  return selectContextChunks(chunks, query, opts).map((c) => c.content)
}
