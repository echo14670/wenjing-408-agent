/**
 * 同考点推荐的纯函数工具（无 Vue / 无别名依赖，可被 node 直跑单测）。
 *
 * 这里刻意只做四件事：筛掉当前题、去重、按核验态排序、生成"切题时到底隔离了什么"的审计。
 * 之所以把审计做成纯函数，是因为"隔离"如果不被展示出来，很容易变成一句口头承诺。
 */
import { clip } from './format.js'

export const RECOMMEND_LIMIT = 3

/** 三种核验态：文案、色板、排序权重（已核验优先） */
export const REVIEW_META = {
  verified: { label: '已核验', tone: 'teal', rank: 0 },
  pending: { label: '待审核', tone: 'amber', rank: 1 },
  unverified: { label: '待核验', tone: 'gray', rank: 2 }
}

export function reviewMeta(state) {
  return REVIEW_META[state] ?? REVIEW_META.unverified
}

/** 题干摘要：压掉换行、超长截断，列表里一行两行能读清楚即可 */
export function summarizeStem(stem, max = 76) {
  return clip(String(stem ?? '').replace(/\s+/g, ' ').trim(), max)
}

/**
 * 过滤与去重：
 *   1. 不能推荐当前正在做的题（按 id 排除）；
 *   2. 同 id 只留一条；无 id 时按题干前 40 字去重（Mock 常见无 id）；
 *   3. 没有题干的脏数据直接丢弃。
 */
export function filterCandidates(list, excludeIds = []) {
  const excluded = new Set((excludeIds ?? []).filter(Boolean))
  const seenId = new Set()
  const seenStem = new Set()
  const out = []
  for (const item of list ?? []) {
    if (!item || !String(item.stem ?? '').trim()) continue
    if (item.id && excluded.has(item.id)) continue
    const stemKey = String(item.stem).replace(/\s+/g, '').slice(0, 40)
    if ((item.id && seenId.has(item.id)) || seenStem.has(stemKey)) continue
    if (item.id) seenId.add(item.id)
    seenStem.add(stemKey)
    out.push(item)
  }
  return out
}

/** 已核验 → 待审核 → 待核验；同态内难度高的靠前，让"再练一道"有递进感 */
export function sortCandidates(list) {
  return [...list].sort((a, b) => {
    const rank = reviewMeta(a.reviewState).rank - reviewMeta(b.reviewState).rank
    if (rank !== 0) return rank
    return (b.difficulty ?? 0) - (a.difficulty ?? 0)
  })
}

export function pickCandidates(list, excludeIds = [], limit = RECOMMEND_LIMIT) {
  return sortCandidates(filterCandidates(list, excludeIds)).slice(0, Math.max(0, limit))
}

/**
 * 切题前快照 → 隔离审计。
 * 每一项都回答两个问题：这项旧状态有没有？切题后怎么处理？
 * cleared 为 true 表示"确实有旧状态需要清"，用于给用户一句"已隔离 N 项"的量化说明。
 */
export function buildIsolationAudit(before = {}) {
  const chunks = before.chunks ?? 0
  const thought = String(before.thought ?? '').trim()
  const messages = before.messages ?? 0
  const citations = before.citations ?? 0
  const hasTool = Boolean(before.toolResult)
  // 揭示状态在 store 里叫 answerRevealed；保留 answerExpanded 兼容旧调用
  const expanded = Boolean(before.answerRevealed ?? before.answerExpanded)
  const items = [
    {
      key: 'context',
      label: '题目上下文',
      detail: chunks > 0 ? `${chunks} 段切片已清空，不带入新题` : '旧题本无切片',
      cleared: chunks > 0
    },
    {
      key: 'thought',
      label: '我的作答',
      detail: thought ? '已隔离，新题从空白思路开始' : '旧题未作答',
      cleared: Boolean(thought)
    },
    {
      key: 'thread',
      label: '追问记录',
      detail: messages > 0 ? `${messages} 条消息已隔离` : '旧题无追问',
      cleared: messages > 0
    },
    {
      key: 'reveal',
      label: '答案揭示状态',
      detail: expanded ? '旧题展开态已重置为新题默认态' : '旧题本为收起态',
      cleared: expanded
    },
    {
      key: 'tool',
      label: '工具结果',
      detail: hasTool ? '工具输出未继承，需对新题重新计算' : '旧题无工具输出',
      cleared: hasTool
    },
    {
      key: 'citation',
      label: '引用出处',
      detail: citations > 0 ? `${citations} 条引用已隔离` : '旧题无引用',
      cleared: citations > 0
    }
  ]
  return {
    items,
    clearedCount: items.filter((i) => i.cleared).length
  }
}

/** 空候选时的说明文案：区分"真的没有"与"接口没给" */
export function emptyCandidateHint(knowledgePoint, fromFallback) {
  const kp = String(knowledgePoint ?? '').trim()
  if (fromFallback) {
    return '推荐接口未返回候选。题库里可能还没有与本题同考点的其他题目，可以稍后重试。'
  }
  return kp
    ? `题库中暂无「${kp}」的其他题目。可以换一道题继续练，或稍后重试。`
    : '题库中暂无与本题同考点的其他题目。可以换一道题继续练，或稍后重试。'
}
