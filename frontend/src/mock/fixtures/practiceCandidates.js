/**
 * 同考点推荐的示例候选（Mock 兜底用）。
 *
 * 为什么需要它：`/api/recommend` 尚未进契约，Apifox Mock 对未配置路径返回 404。
 * 推荐是"增强入口"，不能因为契约没就绪就让答案页崩掉——因此 404 / 网络不可达时
 * 回落到这份内置候选，并在 UI 上明确标注「示例数据」。
 *
 * 三条自制约束：
 *   1. 题面、答案、推导必须自洽（能算对），否则演示时会被当成解析错误；
 *   2. 来源只写题库编号，不编造教材页码与真题年份（防幻觉红线）；
 *   3. 三种核验态各留一条，方便验收「核验状态」的展示差异。
 *
 * 每道题自带 steps / hints / segments / guidedReply / directReply：
 * Mock 的 /chat 只会返回案例题（32 KiB / 64 B）的讲解，直接用它会让新题看到旧题的推导，
 * 因此练习态在检测到"文案兜底"时改用候选题自带的示例讲解。
 */
export const practiceCandidates = [
  {
    id: 'Q-CACHE-033',
    subject: '计算机组成原理',
    stem:
      '某计算机按字节编址，主存地址 32 位。Cache 数据区容量 64 KiB，块大小 128 B，采用四路组相联映射。' +
      '求主存地址中标记（tag）、组索引与块内偏移各占多少位。',
    answer: '标记 18 位，组索引 7 位，块内偏移 7 位。',
    sourceRef: '题库 Q-CACHE-033 · 计算机组成原理',
    reviewState: 'verified',
    knowledgePoints: ['组相联映射', '地址字段划分'],
    difficulty: 3,
    reason: '同为四路组相联，只是容量与块大小不同',
    steps: [
      {
        index: 1,
        title: '块内偏移',
        formula: 'log₂128 = 7',
        detail: '块大小 128 B，按字节编址，偏移位数 = log₂128 = 7 位。这一步只由块大小决定。'
      },
      {
        index: 2,
        title: '总行数',
        formula: '64 KiB ÷ 128 B = 512',
        detail: '64 × 1024 ÷ 128 = 512 个块，即 512 行 Cache。'
      },
      {
        index: 3,
        title: '组数与组索引',
        formula: '512 ÷ 4 = 128 组，log₂128 = 7',
        detail: '四路表示每组 4 行，组数 = 512 ÷ 4 = 128，组索引位数 = 7 位。'
      },
      {
        index: 4,
        title: '标记位数',
        formula: '32 − 7 − 7 = 18',
        detail: '地址 32 位，减去组索引 7 位与块内偏移 7 位，标记占 18 位。'
      }
    ],
    hints: [
      '先算块内偏移：块大小 128 B 对应几位地址？',
      '再算总行数：64 KiB 里能放下多少个 128 B 的块？',
      '四路表示每组 4 行，用行数除以 4 得到组数。',
      '最后用 32 减去已用的两段位数。'
    ],
    segments: [
      { label: '标记', bits: 18, tone: 'primary' },
      { label: '索引', bits: 7, tone: 'teal' },
      { label: '偏移', bits: 7, tone: 'slate' }
    ],
    guidedReply:
      '这道题和上一题只换了容量与块大小，拆解顺序完全一样。\n\n' +
      '先看块大小 128 B 对应几位偏移；再由数据区容量除以块大小得到总行数；' +
      '注意四路表示每组 4 行，组数是行数的四分之一，别把行数直接当组数取对数。\n\n' +
      '你可以先把总行数算出来：64 KiB 里能装下多少个 128 B 的块？',
    directReply:
      '**第一步：块内偏移**\nlog₂128 = 7 位。\n\n' +
      '**第二步：总行数**\n64 KiB ÷ 128 B = 512 行。\n\n' +
      '**第三步：组数与组索引**\n四路组相联 ⇒ 每组 4 行，512 ÷ 4 = 128 组，索引 7 位。\n\n' +
      '**第四步：标记**\n32 − 7 − 7 = 18 位。\n\n' +
      '地址格式：标记 18 位｜组索引 7 位｜块内偏移 7 位。'
  },
  {
    id: 'Q-CACHE-014',
    subject: '计算机组成原理',
    stem:
      '某机主存地址 16 位，Cache 数据区容量 1 KiB，块大小 32 B，采用二路组相联映射。' +
      '求标记、组索引与块内偏移各占多少位。',
    answer: '标记 7 位，组索引 4 位，块内偏移 5 位。',
    sourceRef: '题库 Q-CACHE-014 · 计算机组成原理',
    reviewState: 'verified',
    knowledgePoints: ['组相联映射', '地址字段划分'],
    difficulty: 2,
    reason: '二路组相联，用来检验「路数不是组数」是否真的理解',
    steps: [
      { index: 1, title: '块内偏移', formula: 'log₂32 = 5', detail: '块大小 32 B ⇒ 偏移 5 位。' },
      { index: 2, title: '总行数', formula: '1 KiB ÷ 32 B = 32', detail: '1024 ÷ 32 = 32 行。' },
      { index: 3, title: '组数与组索引', formula: '32 ÷ 2 = 16 组，log₂16 = 4', detail: '二路 ⇒ 每组 2 行，32 ÷ 2 = 16 组，索引 4 位。' },
      { index: 4, title: '标记位数', formula: '16 − 4 − 5 = 7', detail: '地址 16 位，剩余 7 位给标记。' }
    ],
    hints: ['先把 1 KiB 换算成 1024 B，再算能装多少块。', '二路表示每组两行，组数是行数的一半。'],
    segments: [
      { label: '标记', bits: 7, tone: 'primary' },
      { label: '索引', bits: 4, tone: 'teal' },
      { label: '偏移', bits: 5, tone: 'slate' }
    ],
    guidedReply:
      '这题地址只有 16 位，容量也小，但顺序不变：偏移 → 行数 → 组数 → 标记。\n\n' +
      '提醒一句：1 KiB = 1024 B，先算 1024 ÷ 32 得到行数；二路意味着每组两行。',
    directReply:
      '**第一步：块内偏移**\nlog₂32 = 5 位。\n\n' +
      '**第二步：总行数**\n1024 ÷ 32 = 32 行。\n\n' +
      '**第三步：组数与组索引**\n二路 ⇒ 16 组，索引 4 位。\n\n' +
      '**第四步：标记**\n16 − 4 − 5 = 7 位。'
  },
  {
    id: 'Q-CACHE-021',
    subject: '计算机组成原理',
    stem:
      '某机主存地址 24 位，Cache 数据区容量 8 KiB，块大小 32 B，采用直接映射。' +
      '求标记、行号（Cache 行索引）与块内偏移各占多少位。',
    answer: '标记 11 位，行号 8 位，块内偏移 5 位。',
    sourceRef: '题库 Q-CACHE-021 · 计算机组成原理',
    reviewState: 'pending',
    knowledgePoints: ['直接映射', '地址字段划分'],
    difficulty: 2,
    reason: '同一套地址划分方法，换成直接映射做对比',
    steps: [
      { index: 1, title: '块内偏移', formula: 'log₂32 = 5', detail: '块大小 32 B ⇒ 偏移 5 位。' },
      { index: 2, title: '行数', formula: '8 KiB ÷ 32 B = 256', detail: '8192 ÷ 32 = 256 行。' },
      { index: 3, title: '行号位数', formula: 'log₂256 = 8', detail: '直接映射没有"组"，行号就是索引，占 8 位。' },
      { index: 4, title: '标记位数', formula: '24 − 8 − 5 = 11', detail: '剩余 11 位用于标记。' }
    ],
    hints: ['直接映射没有"组"，行号直接就是索引。', '先算 8 KiB 能装多少个 32 B 的块。'],
    segments: [
      { label: '标记', bits: 11, tone: 'primary' },
      { label: '行号', bits: 8, tone: 'teal' },
      { label: '偏移', bits: 5, tone: 'slate' }
    ],
    guidedReply:
      '直接映射是组相联的特例：每组只有一行，所以"组索引"退化成"行号"。\n\n' +
      '先算 8 KiB 能装多少个 32 B 的块，那个数就是行数。',
    directReply:
      '**第一步：块内偏移**\nlog₂32 = 5 位。\n\n' +
      '**第二步：行数**\n8192 ÷ 32 = 256 行。\n\n' +
      '**第三步：行号**\nlog₂256 = 8 位。\n\n' +
      '**第四步：标记**\n24 − 8 − 5 = 11 位。'
  },
  {
    id: 'Q-CACHE-009',
    subject: '计算机组成原理',
    stem: '全相联映射的 Cache 为什么不需要组索引？它的地址应该如何划分？',
    answer: '',
    sourceRef: '题库 Q-CACHE-009 · 计算机组成原理',
    reviewState: 'unverified',
    knowledgePoints: ['全相联映射', '地址字段划分'],
    difficulty: 1,
    reason: '概念辨析题，用于检验三种映射方式的差别',
    steps: [
      {
        index: 1,
        title: '全相联的放置规则',
        formula: '',
        detail: '主存中任意一块都可以装入 Cache 的任意一行，没有"固定位置"这一说。'
      },
      {
        index: 2,
        title: '地址划分',
        formula: '',
        detail: '既然任意行都能放，就不需要先定位到某一行或某一组，地址只分标记与块内偏移两段。'
      },
      {
        index: 3,
        title: '代价',
        formula: '',
        detail: '查找时要把标记与所有行并行比较，需要比较器阵列，硬件成本随行数线性增长。'
      }
    ],
    hints: ['先想清楚：全相联允许一个主存块放到哪一行？', '如果不能预先定位到某一行，还需要索引吗？'],
    segments: [],
    guidedReply:
      '先回到定义：全相联允许主存中任意一块装入 Cache 的任意一行。\n\n' +
      '那么问题来了——如果任何一行都能放，地址里还需要"先定位到某一行/某一组"的那几位吗？',
    directReply:
      '**第一步：放置规则**\n全相联允许任意主存块装入任意 Cache 行，不存在固定映射位置。\n\n' +
      '**第二步：地址划分**\n因此没有行号/组索引这一层，地址只分标记与块内偏移两段。\n\n' +
      '**第三步：代价**\n查找时标记要与所有行并行比较，需要比较器阵列，成本高，只适合小容量 Cache。'
  }
]

/** 按 id 取候选题；刷新页面时路由上的 practice 参数靠它还原 */
export function findCandidate(id) {
  if (!id) return null
  return practiceCandidates.find((item) => item.id === id) ?? null
}
