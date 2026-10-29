/**
 * chunkTextPro 切片工具单测（npm run test）
 * 覆盖：空输入、无标点硬切、逗号优先、英文缩写、中英混排、纯标点、超长标题、
 *       小数与版本号、纯标题、overlap 超限、末片合并、公式块、标题记录、偏移回溯，
 *       以及 estimateTokens / selectContextChunks / buildContextChunks。
 *
 * 与 scripts/test-chunk.mjs（郑志銮的 chunkText）互补：
 *   chunkText      —— 段落聚合 + 字符窗口，供个人资料库入库使用
 *   chunkTextPro   —— 中文标点分句 + 章节标题 + 打分选片，供三页与 context_chunks 使用
 */
import {
  chunkTextPro,
  selectContextChunks,
  estimateTokens,
  buildContextChunksPro
} from '../src/utils/chunk.js'

const MAX = 480

let passed = 0
let failed = 0

function assert(name, cond, extra = '') {
  if (cond) {
    passed++
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    console.error(`  ❌ ${name} ${extra}`)
  }
}

function maxLen(chunks) {
  return chunks.reduce((m, c) => Math.max(m, c.content.length), 0)
}

// 1) 空文本 / 纯空白 / 连续换行
assert('1a 空字符串返回 []', chunkTextPro('').length === 0)
assert('1b 纯空白返回 []', chunkTextPro('   \n\t  ').length === 0)
assert('1c 连续换行返回 []', chunkTextPro('\n\n\n').length === 0)
assert('1d null 返回 []', chunkTextPro(null).length === 0)

// 2) 5000 字无标点：硬切且每片不超上限
{
  const chunks = chunkTextPro('存'.repeat(5000))
  assert('2a 无标点长文切出 ≥10 片', chunks.length >= 10, `实际 ${chunks.length}`)
  assert('2b 每片不超过上限', maxLen(chunks) <= MAX, `实际 ${maxLen(chunks)}`)
}

// 3) 超长句含逗号：优先在逗号处切
{
  const chunks = chunkTextPro('这是第一小段，'.repeat(200))
  assert('3a 逗号句不超上限', maxLen(chunks) <= MAX, `实际 ${maxLen(chunks)}`)
  assert(
    '3b 存在以逗号结尾的片（说明按逗号切）',
    chunks.filter((c) => c.content.endsWith('，')).length > 0
  )
}

// 4) 纯英文缩写 e.g. / etc. 不被误切
{
  const text =
    'The cache line, e.g. a 64-byte block, is mapped etc. as described. ' + 'More text here. '.repeat(40)
  const chunks = chunkTextPro(text)
  assert('4a 英文段落不超上限', maxLen(chunks) <= MAX, `实际 ${maxLen(chunks)}`)
  assert(
    '4b e.g. 完整留在同一片',
    chunks.some((c) => c.content.includes('e.g. a 64-byte block'))
  )
  assert(
    '4c 未在缩写点后切开',
    chunks.every((c) => !c.content.startsWith('g.') && !c.content.trim().startsWith('tc.'))
  )
}

// 5) 中英混排短文本
{
  const text = 'Cache 的 tag 字段占 19 位，组索引占 7 位，块内偏移占 6 位。'
  const chunks = chunkTextPro(text)
  assert('5a 短文本为单块', chunks.length === 1)
  assert('5b 内容原样保留', chunks[0].content === text)
  assert('5c 英文与数字未被切断', chunks[0].content.includes('Cache') && chunks[0].content.includes('19'))
}

// 6) 只有标点
{
  const chunks = chunkTextPro('。。。。。。')
  assert('6a 不产出空 content', chunks.every((c) => c.content.trim().length > 0))
}

// 7) 200 字超长标题
{
  const heading = '# ' + '标题'.repeat(100)
  const chunks = chunkTextPro(`${heading}\n\n这是一段正文，用来验证超长标题行不会被误判为章节标题。`)
  assert('7a 超长标题行正常切片', chunks.length > 0)
  assert('7b 不超上限', maxLen(chunks) <= MAX, `实际 ${maxLen(chunks)}`)
}

// 8) 小数与版本号
{
  const text = '圆周率约 3.14，版本号 1.2.3 也要保留。'
  const chunks = chunkTextPro(text)
  assert('8a 单块返回', chunks.length === 1)
  assert('8b 小数完整', chunks[0].content.includes('3.14'))
  assert('8c 版本号完整', chunks[0].content.includes('1.2.3'))
}

// 9) 只有标题没有正文
assert('9a 仅 markdown 标题返回 []', chunkTextPro('## 第三章 存储系统').length === 0)
assert('9b 仅章节标题返回 []', chunkTextPro('第三章 存储系统\n\n').length === 0)

// 10) overlap 大于片长
{
  const text = '第一句话结束了。第二句话也结束了。第三句话同样结束了。第四句。'.repeat(20)
  const chunks = chunkTextPro(text, { targetSize: 60, maxSize: 80, overlap: 999 })
  assert('10a 不死循环且产出切片', chunks.length > 0)
  assert('10b 收敛到 maxSize 以内', maxLen(chunks) <= 80, `实际 ${maxLen(chunks)}`)
}

// 11) 末片过短并入前片
{
  const text = '甲'.repeat(280) + '。' + '乙'.repeat(280) + '。' + '短。'
  const chunks = chunkTextPro(text, { targetSize: 300, maxSize: 480, minSize: 80 })
  assert('11a 末片长度 ≥ minSize', chunks[chunks.length - 1].content.length >= 80)
}

// 12) 公式块不被切开
{
  const formula = '$$\\text{组数}=\\frac{\\text{行数}}{4}=128$$'
  const text = `${'前文说明文字，'.repeat(60)}${formula}${'后文说明文字，'.repeat(60)}`
  const chunks = chunkTextPro(text)
  assert('12a 公式块完整保留在单片中', chunks.some((c) => c.content.includes(formula)))
}

// 13) 章节标题被记录
{
  const text = '3.2 Cache 地址划分\n\n主存地址被划分为标记、组索引与块内偏移三段。'
  const plain = chunkTextPro(text)
  assert('13a 标题被识别（保留编号）', plain[0].heading === '3.2 Cache 地址划分', `实际 ${plain[0].heading}`)
  const withHeading = chunkTextPro(text, { keepHeading: true })
  assert('13b keepHeading 时前缀拼入正文', withHeading[0].content.startsWith('【3.2 Cache 地址划分】'))
}

// 14) 偏移量可回溯原文
{
  const text = '3.2 Cache 地址划分\n\n主存地址被划分为标记、组索引与块内偏移三段。'
  const chunks = chunkTextPro(text)
  const { start, end } = chunks[0]
  assert('14a start/end 可回溯原文', text.slice(start, end) === chunks[0].content)
}

// estimateTokens
assert('15a 空串为 0', estimateTokens('') === 0)
assert('15b 中文按字估算', estimateTokens('组相联') >= 4)
assert('15c 英文按 4 字符估算', estimateTokens('cache') <= 3)
assert('15d 混排大于纯中文', estimateTokens('Cache 组相联，组索引 7 位。') > 5)

// selectContextChunks
const doc = [
  '3.1 存储层次\n\n存储系统按容量与速度形成层次结构，Cache 位于 CPU 与主存之间。',
  '3.2 Cache 地址划分\n\n主存地址被划分为标记、组索引与块内偏移三段。块大小 64B 时偏移占 6 位。',
  '3.3 替换算法\n\n常用替换算法包括 LRU、FIFO 与随机替换。',
  '3.4 写策略\n\n写直达与写回策略影响一致性与写带宽。'
].join('\n\n')

const chunks = chunkTextPro(doc, { keepHeading: true })

{
  const picked = selectContextChunks(chunks, 'Cache 地址怎么划分，组索引几位')
  assert('16a 按 query 命中相关章节', picked.length > 0)
  assert('16b 首选片包含组索引', picked[0].content.includes('组索引'))
}
{
  const picked = selectContextChunks(chunks, '的是在如何为什么')
  assert('17a 全停用词仍有兜底返回', picked.length > 0)
}
{
  const picked = selectContextChunks(chunks, 'Cache', { tokenBudget: 1 })
  assert('18a 预算小于首片仍返回一片', picked.length === 1)
}
{
  const dup = chunkTextPro(`${doc}\n\n${doc}`, { keepHeading: true })
  const picked = selectContextChunks(dup, '替换算法 LRU', { topK: 10 })
  const contents = picked.map((c) => c.content)
  assert('19a 重复段落被去重', new Set(contents).size === contents.length)
}
{
  const picked = selectContextChunks(chunks, 'Cache 地址 组索引 替换 写策略', { topK: 2 })
  assert('20a 结果不超过 topK', picked.length <= 2)
}
{
  const longQuery = 'Cache 地址划分 '.repeat(50)
  const picked = selectContextChunks(chunks, longQuery, { topK: 3 })
  assert('21a 超长 query 不溢出', picked.length <= 3)
}
{
  const arr = buildContextChunksPro(doc, '组索引几位')
  assert('22a 产出字符串数组', Array.isArray(arr))
  assert('22b 非空', arr.length > 0)
  assert('22c 元素为 string', typeof arr[0] === 'string')
}

console.log(`\n结果：${passed} 通过，${failed} 失败`)
process.exit(failed > 0 ? 1 : 0)
