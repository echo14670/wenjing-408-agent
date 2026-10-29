/**
 * 占位文本判定。
 *
 * Apifox Mock 在没有填「示例值」时，会用随机拉丁词填充字符串字段，
 * 实测样本：`"mollit officia Duis"`、`"consequat dolore commodo nulla ea"`、
 * `"velit cillum anim"`。这类文本结构上合法、语义上不可用，
 * 直接上屏会让页面看起来像故障。
 *
 * 判定策略：强规则直接判死，弱规则加权；命中 408 术语时反向降权，
 * 避免把真实的英文技术文本误判为占位。
 */
/** Lorem Ipsum / 常见随机拉丁词表（Apifox Mock 的取值池） */
const LOREM_WORDS = new Set([
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'eiusmod',
  'tempor',
  'incididunt',
  'labore',
  'dolore',
  'magna',
  'aliqua',
  'enim',
  'minim',
  'veniam',
  'quis',
  'nostrud',
  'exercitation',
  'ullamco',
  'laboris',
  'nisi',
  'aliquip',
  'commodo',
  'consequat',
  'duis',
  'aute',
  'irure',
  'reprehenderit',
  'voluptate',
  'velit',
  'esse',
  'cillum',
  'fugiat',
  'nulla',
  'pariatur',
  'excepteur',
  'sint',
  'occaecat',
  'cupidatat',
  'proident',
  'sunt',
  'culpa',
  'officia',
  'deserunt',
  'mollit',
  'anim',
  'laborum',
  'sed',
  'ut',
  'et',
  'in',
  'do',
  'ea',
  'ad',
  'ex',
  'non'
])
/** 408 领域术语白名单：出现两个以上基本可判定为真实技术文本 */
const DOMAIN_TERMS = [
  'cache',
  'tlb',
  '页表',
  '缺页',
  '中断',
  '流水线',
  '进程',
  '线程',
  '信号量',
  '死锁',
  '调度',
  '带宽',
  '地址',
  '指令',
  '寄存器',
  '总线',
  '寻址',
  '段页',
  '置换',
  '组相联',
  '页表项',
  '块大小',
  '标记',
  '索引',
  '偏移',
  '虚存',
  '快表',
  'dma',
  'cpi',
  'risc',
  'tcp',
  'ip',
  'http',
  'tlb'
]
const CJK_RE = /[\u4e00-\u9fff]/g
function latinTokens(text) {
  return (text.toLowerCase().match(/[a-z]{2,}/g) ?? []).filter(Boolean)
}
/** Mock 常见的「占位字面量」，长度虽短但绝不能上屏 */
const TRIVIAL_LITERALS =
  /^(null|undefined|nil|none|string|number|integer|boolean|true|false|object|array|unknown|-|--|n\/a)$/i
/**
 * 占位概率 0~1，越高越像 Mock 随机串。
 */
export function placeholderScore(text) {
  const raw = (text ?? '').trim()
  if (!raw) return 0
  // Apifox Mock 对可空字段有时直接返回字符串 "null"，这类必须先判掉
  if (TRIVIAL_LITERALS.test(raw)) return 1
  if (raw.length <= 6) return 0
  const tokens = latinTokens(raw)
  const cjkCount = (raw.match(CJK_RE) ?? []).length
  // 强规则 A：伪拉丁词占比高 → 直接判死
  if (tokens.length) {
    const loremHits = tokens.filter((t) => LOREM_WORDS.has(t)).length
    if (loremHits / tokens.length >= 0.4) return 1
  }
  let score = 0
  // 强规则 B：整段没有一个中文字符，且有一定长度
  if (cjkCount === 0 && raw.length > 16) score += 0.7
  // 强规则 C：连续 3 个以上全小写短词，且不含领域术语
  const domainHits = DOMAIN_TERMS.filter((t) => raw.toLowerCase().includes(t)).length
  if (/(^|\s)[a-z]{3,7}(\s+[a-z]{3,7}){2,}/.test(raw) && domainHits < 1) score += 0.5
  // 弱规则 D：中文占比过低
  if (raw.length > 30 && cjkCount / raw.length < 0.15) score += 0.25
  // 弱规则 E：词汇重复率低（随机串几乎不重复）
  if (tokens.length >= 4) {
    const unique = new Set(tokens).size
    if (unique / tokens.length < 0.5) score -= 0.15
  }
  // 反向规则：命中领域术语则大幅降权
  if (domainHits >= 2) score *= 0.3
  return Math.max(0, Math.min(1, score))
}
export const PLACEHOLDER_THRESHOLD = 0.6
export function isPlaceholder(text, threshold = PLACEHOLDER_THRESHOLD) {
  return placeholderScore(text) >= threshold
}
/** 数组元素逐个判定，全部可替换才替换（保持长度不变） */
export function pickFixtures(source, fallback) {
  if (!source || !source.length) return fallback
  const usable = source.filter((s) => !isPlaceholder(s))
  if (!usable.length) return fallback
  // 有一部分可用时，用可用部分 + 兜底补齐，避免长度语义丢失
  return source.map((s, i) => (isPlaceholder(s) ? fallback[i % fallback.length] : s))
}
