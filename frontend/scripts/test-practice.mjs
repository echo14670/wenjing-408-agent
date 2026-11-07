/**
 * 同考点推荐 / 切题隔离 纯函数单测（npm run test:practice）
 *
 * 覆盖四组：
 *   1. 候选筛选：排除当前题、去重、丢弃无题干脏数据、限额；
 *   2. 候选排序与展示：已核验优先、摘要截断、核验态兜底文案；
 *   3. 隔离审计：有旧状态时计数正确，空状态时不虚报；
 *   4. 契约归一化：三种候选键、字符串元素、缺字段降级、占位兜底用的 fixture 完整度。
 */
import {
  RECOMMEND_LIMIT,
  buildIsolationAudit,
  emptyCandidateHint,
  filterCandidates,
  pickCandidates,
  reviewMeta,
  sortCandidates,
  summarizeStem
} from '../src/utils/practice.js'
import { normalizeRecommend, normalizeQuestion } from '../src/api/normalize.js'
import { practiceCandidates, findCandidate } from '../src/mock/fixtures/practiceCandidates.js'
import { isPlaceholder } from '../src/mock/garbage.js'

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

const CURRENT = 'Q-CACHE-001'

/* ---------------- 1. 候选筛选 ---------------- */
console.log('\n[1] 候选筛选')
const rawList = [
  { id: CURRENT, stem: '当前题：32 位地址、32 KiB、64 B、四路组相联' },
  { id: 'Q-A', stem: '十六位地址，二路组相联，求各字段位数' },
  { id: 'Q-A', stem: '十六位地址，二路组相联，求各字段位数（重复条目）' },
  { id: 'Q-B', stem: '   ' },
  { id: null, stem: '二十四位地址，直接映射，求各字段位数' },
  { id: null, stem: '二十四位地址，直接映射，求各字段位数' }
]

const filtered = filterCandidates(rawList, [CURRENT])
assert('1a 排除当前题', filtered.every((c) => c.id !== CURRENT))
assert('1b 同 id 去重', filtered.filter((c) => c.id === 'Q-A').length === 1)
assert('1c 无题干被丢弃', filtered.every((c) => c.stem.trim().length > 0))
assert('1d 无 id 时按题干去重', filtered.length === 2, `实际 ${filtered.length}`)
assert('1e 空数组不报错', filterCandidates([], [CURRENT]).length === 0)
assert('1f 传入 undefined 不报错', filterCandidates(undefined).length === 0)
assert('1g 不传 excludeIds 时保留原题', filterCandidates(rawList, []).some((c) => c.id === CURRENT))

/* ---------------- 2. 排序与展示 ---------------- */
console.log('\n[2] 排序与展示')
const sorted = sortCandidates([
  { id: 'u1', stem: '待核验题', reviewState: 'unverified', difficulty: 5 },
  { id: 'v1', stem: '已核验题', reviewState: 'verified', difficulty: 1 },
  { id: 'p1', stem: '待审核题', reviewState: 'pending', difficulty: 3 },
  { id: 'v2', stem: '已核验题（更难）', reviewState: 'verified', difficulty: 4 }
])
assert('2a 已核验排最前', sorted[0].reviewState === 'verified')
assert('2b 同核验态内难度高的靠前', sorted[0].id === 'v2')
assert('2c 待核验排最后', sorted[sorted.length - 1].reviewState === 'unverified')
assert('2d 排序不修改原数组', rawList[0].id === CURRENT && sorted.length === 4)
assert('2e 限额生效', pickCandidates(practiceCandidates, [CURRENT], 2).length === 2)
assert('2f 默认限额为 3', RECOMMEND_LIMIT === 3)
assert('2g 摘要压掉换行', summarizeStem('第一行\n第二行').includes('\n') === false)
assert('2h 摘要超长截断带省略号', summarizeStem('题'.repeat(120), 40).endsWith('…'))
assert('2i 摘要不截断短文本', summarizeStem('短题干') === '短题干')
assert('2j 未知核验态按待核验', reviewMeta('weird').label === '待核验')
assert('2k 三种核验态文案', reviewMeta('verified').label === '已核验' && reviewMeta('pending').label === '待审核')

/* ---------------- 3. 隔离审计 ---------------- */
console.log('\n[3] 隔离审计')
const busy = buildIsolationAudit({
  chunks: 3,
  thought: '我觉得四路就是四组',
  messages: 2,
  toolResult: '命中 3 段资料',
  citations: 2,
  answerRevealed: true
})
assert('3a 六项全部列出', busy.items.length === 6)
assert('3b 有旧状态时 clearedCount = 6', busy.clearedCount === 6, `实际 ${busy.clearedCount}`)
assert('3c 上下文写明段数', busy.items[0].detail.includes('3 段'))
assert('3d 工具结果标记为未继承', busy.items.find((i) => i.key === 'tool').detail.includes('未继承'))
const empty = buildIsolationAudit({ chunks: 0, thought: '', messages: 0, toolResult: null, citations: 0 })
assert('3e 空状态不虚报隔离项', empty.clearedCount === 0)
assert('3f 空状态仍给六项说明', empty.items.length === 6)
assert('3g 缺参数不抛错', buildIsolationAudit().clearedCount === 0)
assert('3h 纯空白作答不算已作答', buildIsolationAudit({ thought: '   ' }).clearedCount === 0)

/* ---------------- 4. 契约归一化与空态文案 ---------------- */
console.log('\n[4] 契约归一化与空态文案')
const n1 = normalizeRecommend({
  knowledge_point: 'Cache 地址划分',
  candidates: [
    {
      question_id: 'Q-X',
      stem: '题干 A',
      source_ref: '题库 Q-X',
      review_state: '已核验',
      knowledge_points: ['组相联映射'],
      difficulty: '3'
    },
    { stem: '只有题干的元素' },
    { stem: '' }
  ]
})
assert('4a 识别 candidates 键', n1.candidates.length === 2)
assert('4b 中核验态别名归一', n1.candidates[0].reviewState === 'verified')
assert('4c 字符串难度转数字', n1.candidates[0].difficulty === 3)
assert('4d 缺核验态按待核验', n1.candidates[1].reviewState === 'unverified')
assert('4e 考点透传', n1.knowledgePoint === 'Cache 地址划分')
const n2 = normalizeRecommend({ data: { recommendations: ['字符串候选一', '字符串候选二'] } })
assert('4f 兼容 data 包裹与 recommendations 键', n2.candidates.length === 2)
assert('4g 字符串候选无 id 也保留', n2.candidates[0].id === null)
assert('4h 空响应不抛错', normalizeRecommend(null).candidates.length === 0)
assert('4i 非法元素被丢弃', normalizeRecommend({ candidates: [1, null, {}] }).candidates.length === 0)

assert('4j 空态文案带考点名', emptyCandidateHint('组相联映射', false).includes('组相联映射'))
assert('4k 兜底空态文案区分原因', emptyCandidateHint('', true).includes('接口'))
assert('4l 无考点名也能给文案', emptyCandidateHint('', false).length > 10)

/* ---------------- 5. 内置候选 fixture ---------------- */
console.log('\n[5] 内置候选 fixture')
assert('5a 三种核验态齐全', new Set(practiceCandidates.map((c) => c.reviewState)).size === 3)
assert('5b 每条都有来源', practiceCandidates.every((c) => c.sourceRef && c.sourceRef.trim()))
assert('5c 已核验题都有答案', practiceCandidates.filter((c) => c.reviewState === 'verified').every((c) => c.answer.trim()))
assert('5d 存在无答案的待核验题（验证"不展示题库答案"）', practiceCandidates.some((c) => !c.answer.trim()))
assert('5e 按 id 可反查（刷新还原用）', findCandidate('Q-CACHE-033')?.id === 'Q-CACHE-033')
assert('5f 不存在的 id 返回 null', findCandidate('Q-NOT-EXIST') === null)
assert('5g 去重后按上限取 3 道', pickCandidates(practiceCandidates, [CURRENT]).length === 3)

/* ---------------- 6. 题面归一化与占位短串 ---------------- */
console.log('\n[6] 题面归一化与占位短串')
const q = normalizeQuestion({
  question_id: 'Q-T',
  stem: '题干',
  answer: '答案',
  review_state: '待核验',
  steps: [{ title: '第一步', formula: 'log₂8 = 3', detail: '说明' }, '纯字符串步骤', {}],
  hints: ['提示一', 3, '提示二'],
  segments: [
    { label: '标记', bits: 18, tone: 'primary' },
    { label: '', bits: 7 },
    { label: '偏移', bits: '7' }
  ]
})
assert('6a 步骤保留有效项', q.steps.length === 2, `实际 ${q.steps.length}`)
assert('6b 纯字符串步骤自动补标题', q.steps[1].title === '第 2 步')
assert('6c 提示只保留字符串', q.hints.length === 2)
assert('6d 分段条丢弃缺字段项', q.segments.length === 2)
assert('6e 分段 bits 转数字', q.segments[1].bits === 7)
assert('6f 核验态中英别名归一', q.reviewState === 'unverified')
assert('6g 短拉丁占位词被判死', isPlaceholder('velit') === true)
assert('6h 正常短词不误判', isPlaceholder('cache') === false)

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
