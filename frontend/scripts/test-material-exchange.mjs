/**
 * materialExchange 资料交换模块单测（P 包）
 * 覆盖：损坏 JSON、格式/结构错误、版本不支持、空正文、部分无效、
 *       去重（ID + 正文摘要）、缺失 ID 补全、导出→导入往返。
 */
import {
  buildExchangePayload,
  parseExchange,
  contentDigest,
  restoreText
} from '../src/utils/materialExchange.js'

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

const sampleItems = [
  {
    material_id: 'mat_a',
    title: '操作系统笔记',
    file_type: 'text',
    created_at: '2026-11-01T00:00:00.000Z',
    extracted_text: '分页机制：页表存放逻辑地址到物理地址的映射。'
  },
  {
    material_id: 'mat_b',
    title: '组成原理',
    file_type: 'pdf',
    created_at: '2026-11-02T00:00:00.000Z',
    extracted_text: 'Cache 命中率与平均访问时间的计算方法。'
  }
]

// 1) 损坏 JSON
assert('损坏 JSON 整体拒绝', parseExchange('{not json').ok === false)
assert('损坏 JSON 标记 parse 阶段', parseExchange('{not json').stage === 'parse')

// 2) 格式标识错误
const badFormat = JSON.stringify({ format: 'other', version: 1, items: [] })
assert('格式标识不符拒绝', parseExchange(badFormat).ok === false)
assert('格式错误归为 structure', parseExchange(badFormat).stage === 'structure')

// 3) 版本不支持
const badVersion = JSON.stringify({ format: 'wenjing-materials', version: 99, items: [] })
assert('版本不支持整体拒绝', parseExchange(badVersion).ok === false)
assert('版本错误归为 version', parseExchange(badVersion).stage === 'version')

// 4) 缺 items 数组
const noItems = JSON.stringify({ format: 'wenjing-materials', version: 1 })
assert('缺 items 拒绝', parseExchange(noItems).ok === false)

// 5) 空正文条目
const emptyBody = JSON.stringify({
  format: 'wenjing-materials',
  version: 1,
  items: [{ material_id: 'mat_x', title: '空', extracted_text: '   ' }]
})
const emptyRes = parseExchange(emptyBody)
assert('空正文计入 invalid', emptyRes.invalid.length === 1 && emptyRes.candidates.length === 0)

// 6) 部分无效：有效 + 无效混合
const mixed = JSON.stringify({
  format: 'wenjing-materials',
  version: 1,
  items: [
    { material_id: 'mat_ok', title: '有效', extracted_text: '这是一段有效正文。' },
    { material_id: 'mat_no', title: '无效', extracted_text: '' }
  ]
})
const mixedRes = parseExchange(mixed)
assert('部分无效仍可继续', mixedRes.ok === true)
assert('有效条目进入候选', mixedRes.candidates.length === 1)
assert('无效条目被记录', mixedRes.invalid.length === 1)

// 7) 去重：与现有库 ID 重复
const dupId = JSON.stringify({
  format: 'wenjing-materials',
  version: 1,
  items: [{ material_id: 'mat_a', title: '重复', extracted_text: '分页机制：页表存放逻辑地址到物理地址的映射。' }]
})
const dupIdRes = parseExchange(dupId, sampleItems)
assert('ID 重复跳过', dupIdRes.skipped.length === 1 && dupIdRes.candidates.length === 0)

// 8) 去重：ID 不同但正文摘要相同
const dupDigest = JSON.stringify({
  format: 'wenjing-materials',
  version: 1,
  items: [{ material_id: 'mat_newid', title: '换ID同正文', extracted_text: '分页机制：页表存放逻辑地址到物理地址的映射。' }]
})
const dupDigestRes = parseExchange(dupDigest, sampleItems)
assert('正文摘要重复跳过', dupDigestRes.skipped.length === 1)

// 9) 同文件内重复条目
const innerDup = JSON.stringify({
  format: 'wenjing-materials',
  version: 1,
  items: [
    { material_id: 'mat_same', title: 'A', extracted_text: '完全相同的一段正文内容。' },
    { material_id: 'mat_same', title: 'B', extracted_text: '完全相同的一段正文内容。' }
  ]
})
const innerRes = parseExchange(innerDup)
assert('文件内重复只保留一份', innerRes.candidates.length === 1 && innerRes.skipped.length === 1)

// 10) 缺失 ID 按摘要补全
const noId = JSON.stringify({
  format: 'wenjing-materials',
  version: 1,
  items: [{ title: '无ID', extracted_text: '需要补全标识的正文。' }]
})
const noIdRes = parseExchange(noId)
assert('缺失 ID 被补全', noIdRes.candidates.length === 1 && noIdRes.candidates[0].material_id.startsWith('mat_'))
assert('补全 ID 等于正文摘要', noIdRes.candidates[0].material_id === `mat_${contentDigest('需要补全标识的正文。')}`)

// 11) 导出 → 导入往返
const payload = buildExchangePayload(sampleItems)
assert('导出 format/version 正确', payload.format === 'wenjing-materials' && payload.version === 1)
const roundText = JSON.stringify(payload)
const roundRes = parseExchange(roundText, [])
assert('导出文件可被重新解析', roundRes.candidates.length === 2)
assert('往返正文一致', roundRes.candidates[0].extracted_text === sampleItems[0].extracted_text)

// 12) 旧数据无 extracted_text 时由 chunks 兜底
const legacy = { material_id: 'mat_old', chunks: [{ text: '切片一' }, { text: '切片二' }] }
assert('旧数据正文由切片还原', restoreText(legacy) === '切片一\n切片二')

// 13) 导出不含额外字段
assert('导出条目仅五个字段', Object.keys(payload.items[0]).length === 5)

console.log(`\n结果：${passed} 通过，${failed} 失败`)
process.exit(failed > 0 ? 1 : 0)
