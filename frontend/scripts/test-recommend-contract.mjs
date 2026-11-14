/**
 * 真实推荐契约与 TD-06 清偿验收（npm run test:recommend）
 *
 * 覆盖五组：
 *   1. POST /api/recommend 请求体字段与后端 RecommendRequest 完全一致；
 *   2. 响应 questions / scope / notice 归一化，QuestionData 字段不丢；
 *   3. 真实空结果保持空、非法 scope 不编造、占位文本不流入候选；
 *   4. 详情只补空字段，不覆盖推荐响应里的权威答案与解析；
 *   5. 源码级防回归：真实路径不得再出现静默回落 / 404-5xx 兜底。
 */
import {
  buildRecommendPayload,
  mergeQuestionDetail,
  scopeMeta,
  recommendScopeLine,
  emptyCandidateHint
} from '../src/utils/practice.js'
import { normalizeRecommend, normalizeQuestion } from '../src/api/normalize.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

/* ---------------- 1. 请求体契约 ---------------- */
console.log('\n[1] POST /api/recommend 请求体')
const body = buildRecommendPayload({
  questionId: 'COP006',
  doneQuestionIds: ['COP005', 'COP005', '', null, '  OS001  '],
  limit: 5,
  includeUnverified: true
})
assert('1a 四个字段齐全', Object.keys(body).sort().join(',') ===
  'done_question_ids,include_unverified,question_id,top_k')
assert('1b question_id 正确', body.question_id === 'COP006')
assert('1c 已做题去重去空并 trim', JSON.stringify(body.done_question_ids) === '["COP005","OS001"]')
assert('1d top_k 取值', body.top_k === 5)
assert('1e include_unverified 布尔', body.include_unverified === true)
assert('1f 默认关闭未核验兜底', buildRecommendPayload({ questionId: 'Q1' }).include_unverified === false)
assert('1g top_k 上限 10', buildRecommendPayload({ questionId: 'Q1', limit: 99 }).top_k === 10)
assert('1h top_k 下限 1', buildRecommendPayload({ questionId: 'Q1', limit: -3 }).top_k === 1)
assert('1i 缺省 top_k 为 3', buildRecommendPayload({ questionId: 'Q1' }).top_k === 3)
assert('1j 非字符串 id 被丢弃', buildRecommendPayload({ doneQuestionIds: [3, {}, 'Q2'] }).done_question_ids.join() === 'Q2')

/* ---------------- 2. 响应归一化 ---------------- */
console.log('\n[2] 响应 questions / scope / notice')
const official = normalizeRecommend({
  questions: [
    {
      question_id: 'COP005',
      subject: '计算机组成原理',
      chapter: '存储器层次结构',
      stem: '某计算机主存容量 1 GB、按字节编址，Cache 数据区容量 64 KB，直接映射，求各字段位数。',
      options: ['A. 6、10、14', 'B. 6、16、8'],
      answer: 'A',
      solution: '块内偏移 6 位，Cache 块号 10 位，标记 16 位。',
      review_state: 'verified',
      source_ref: '408 真题 · 2020 年第 15 题'
    }
  ],
  scope: 'chapter',
  notice: '以下题目尚未完成核验，仅作同考点练习推荐。'
})
assert('2a 认正式 questions 键', official.candidates.length === 1)
assert('2b scope 透传', official.scope === 'chapter')
assert('2c notice 透传', official.notice.includes('尚未完成核验'))
const c = official.candidates[0]
assert('2d QuestionData 答案不丢', c.answer === 'A')
assert('2e QuestionData 解析不丢', c.solution.includes('块内偏移'))
assert('2f QuestionData 选项不丢', c.options.length === 2)
assert('2g QuestionData 章节不丢', c.chapter === '存储器层次结构')
assert('2h 核验态归一', c.reviewState === 'verified')
assert('2i 来源不丢', c.sourceRef.includes('408 真题'))
const q = normalizeQuestion({
  question_id: 'COP005',
  chapter: '存储器层次结构',
  stem: '题干',
  options: ['A', 'B'],
  answer: 'A',
  solution: '解析',
  review_state: 'verified',
  source_ref: '来源'
})
assert('2j 题目对象保留 chapter/options', q.chapter === '存储器层次结构' && q.options.length === 2)

/* ---------------- 3. 空结果与异常输入 ---------------- */
console.log('\n[3] 空结果 / 非法 scope / 兼容键')
const empty = normalizeRecommend({ questions: [], scope: 'none', notice: '' })
assert('3a 空 questions 就是空候选', empty.candidates.length === 0)
assert('3b scope=none 被保留', empty.scope === 'none')
assert('3c 非法 scope 归为 null', normalizeRecommend({ questions: [], scope: 'random' }).scope === null)
assert('3d 缺 scope 为 null', normalizeRecommend({ questions: [] }).scope === null)
assert('3e 兼容旧 candidates 键', normalizeRecommend({ candidates: [{ stem: '旧样例题干足够长' }] }).candidates.length === 1)
assert('3f data 包裹仍可解析', normalizeRecommend({ data: { questions: [{ stem: 'data 包裹的题干' }] } }).candidates.length === 1)
assert('3g 空响应不抛错', normalizeRecommend(null).candidates.length === 0)

/* ---------------- 4. scope 文案与空态 ---------------- */
console.log('\n[4] scope 文案与空态')
assert('4a 同考点标签', scopeMeta('knowledge_point').label === '同考点')
assert('4b 同章节标签', scopeMeta('chapter').label === '同章节')
assert('4c 同章节说明解释降级原因', scopeMeta('chapter').hint.includes('扩展到同章节'))
assert('4d 未知 scope 不编造', scopeMeta('whatever') === null)
assert('4e 标题带真实章节名', recommendScopeLine('chapter', '', '存储器层次结构').includes('存储器层次结构'))
assert('4f 标题优先后端考点', recommendScopeLine('knowledge_point', '组相联映射', '存储器层次结构').includes('组相联映射'))
assert('4g 无名称时用中性文案', recommendScopeLine(null, '', '') === '同考点题')
assert('4h chapter 空态说明两级范围', emptyCandidateHint('', false, 'chapter').includes('同考点及同章节'))
assert('4i 真实空态不谎称接口问题', !emptyCandidateHint('组相联', false).includes('接口未返回'))

/* ---------------- 5. 详情降级不丢字段 ---------------- */
console.log('\n[5] 详情只补空字段')
const base = {
  questionId: 'COP005', subject: '计算机组成原理', chapter: '存储器层次结构',
  stem: '完整题干', options: ['A'], answer: 'A', solution: '权威解析', sourceRef: '真来源',
  reviewState: 'verified', steps: [{ title: '第 1 步' }], hints: ['提示'], segments: []
}
const detail = {
  questionId: 'COP005', chapter: '别的章节', stem: '别的题干', answer: 'B',
  solution: '别的解析', sourceRef: '别的来源', options: ['X'], steps: [], hints: [], segments: [{ label: '标记', bits: 18 }]
}
const merged = mergeQuestionDetail(base, detail)
assert('5a 不覆盖权威答案', merged.answer === 'A')
assert('5b 不覆盖权威解析', merged.solution === '权威解析')
assert('5c 不覆盖题面与来源', merged.stem === '完整题干' && merged.sourceRef === '真来源')
assert('5d 不覆盖已有选项/步骤/提示', merged.options.length === 1 && merged.steps.length === 1 && merged.hints.length === 1)
assert('5e 补齐原本为空的分段', merged.segments.length === 1)
const sparse = mergeQuestionDetail(
  { questionId: 'Q9', stem: '题干', answer: '', solution: '', sourceRef: null, options: [], steps: [], hints: [], segments: [] },
  { answer: 'B', solution: '解析', sourceRef: '来源', options: ['A'], steps: [{ title: 's' }] }
)
assert('5f 空字段由详情补齐', sparse.answer === 'B' && sparse.solution === '解析' && sparse.sourceRef === '来源')
assert('5g 空数组字段由详情补齐', sparse.options.length === 1 && sparse.steps.length === 1)

/* ---------------- 6. 源码级防回归（TD-06） ---------------- */
console.log('\n[6] 真实路径无静默兜底')
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '../src/api/practice.js'), 'utf8')
// 3 次 = import 的标识符与路径各 1 次 + 显式演示分支 1 次；多一次都说明真实路径又被塞了样例
assert('6a 示例候选仅 import + 显式演示分支', (source.match(/practiceCandidates/g) ?? []).length === 3)
assert('6b 已移除 shouldFallback', !source.includes('shouldFallback'))
assert('6c 已移除 GET 推荐的 query 参数', !source.includes('params: { question_id'))
assert('6d 推荐改 POST', /url: API_PATHS\.recommend,[\s\S]{0,120}method: 'POST'/.test(source))
assert('6e 请求失败不吞成示例数据', !/catch \(err\)[\s\S]{0,500}practiceCandidates/.test(source))
assert('6f 真实路径不含 5xx 兜底判断', !/err\.status >= 500/.test(source))
assert('6g 显式演示分支确实存在', source.includes('if (demo) {'))
assert('6h 详情失败不标示例', /detailStatus: 'unavailable'/.test(source) && !/demo: true,[\s\S]{0,80}unavailable/.test(source))
assert('6i 空响应不填样例', /questions=\[\] 就是真的没有/.test(source))

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
