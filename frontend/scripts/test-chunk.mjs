/**
 * chunkText 切片工具单测（npm run test:chunk）
 * 覆盖：空输入、短文本不切、段落聚合、超长段落窗口切分（带 overlap）、切片上限约束。
 */
import { chunkText, chunkMaterial, buildContextChunks } from '../src/utils/chunkText.js'

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

// 1) 空输入
assert('空输入返回 []', chunkText('').length === 0)
assert('null 输入返回 []', chunkText(null).length === 0)

// 2) 短文本不切
const short = '为什么需要 TLB？如果页表放在内存里，访问数据前还要先查页表。'
assert('短文本单块返回', chunkText(short).length === 1 && chunkText(short)[0] === short)

// 3) 段落聚合：多段但总长小于 maxLength → 单块
const small = ['第一段。', '第二段。', '第三段。'].join('\n')
assert('多段小文本聚合为单块', chunkText(small, { maxLength: 800 }).length === 1)

// 4) 超长段落：窗口切分 + overlap
const longPara = '甲'.repeat(2000)
const chunks = chunkText(longPara, { maxLength: 500, overlap: 60, minChunk: 10 })
assert('2000 字长段被切分为多块', chunks.length > 2)
assert('每块长度 ≤ maxLength', chunks.every((c) => c.length <= 500))
const hasOverlap = chunks[1].slice(0, 60) === '甲'.repeat(60)
assert('相邻块保留 overlap 前缀', hasOverlap)

// 5) 段落聚合跨块：每段 200 字 × 5 段，maxLength 500 → 200+200 可合并为一块（含换行）
const paras = Array.from({ length: 5 }, (_, i) => `段落${i + 1}：` + '乙'.repeat(180))
const pc = chunkText(paras.join('\n'), { maxLength: 500, overlap: 0, minChunk: 50 })
assert('200字段落可两两合并', pc.length === 3, `实际 ${pc.length} 块`)
assert('聚合块内包含换行符', pc.some((c) => c.includes('\n')))
assert('每块长度 ≤ maxLength', pc.every((c) => c.length <= 500))

// 6) chunkMaterial 编号：长文本切出多块，编号连续
const mat = chunkMaterial('mat_1', '甲'.repeat(2000), { maxLength: 500, overlap: 60, minChunk: 50 })
assert('chunkMaterial 生成多块', mat.length >= 3, `实际 ${mat.length} 块`)
assert('chunkMaterial 编号从 1 连续递增', mat.every((c, i) => c.chunk_id === `mat_1_${i + 1}` && c.order === i + 1))

// 7) buildContextChunks 汇总与上限
const m1 = { updated_at: 2, chunks: [{ text: 'A1' }, { text: 'A2' }] }
const m2 = { updated_at: 1, chunks: [{ text: 'B1' }] }
const all = buildContextChunks([m1, m2], 10)
assert('buildContextChunks 汇总全部', all.length === 3 && all.includes('A1') && all.includes('B1'))
const capped = buildContextChunks([m1, m2], 2)
assert('buildContextChunks 截取上限 2', capped.length === 2)
assert('截取按时间取最新', capped[0] === 'A1' && capped[1] === 'A2')

console.log(`\n结果：${passed} 通过，${failed} 失败`)
process.exit(failed > 0 ? 1 : 0)
