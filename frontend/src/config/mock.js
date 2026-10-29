/**
 * Mock 联调配置与本地三态样例数据（郑志銮 · 输入/搜索/结果页）
 *
 * 团队约定 Mock 地址（见「stage2 - 接口联调与开发交接.md」）：
 *   原题   https://m1.apifoxmock.com/m1/8972811-8778665-default/api/search
 *   未命中 https://m1.apifoxmock.com/m1/8972811-8778665-default/api/search?apifoxResponseId=342552720
 *   对话   https://m1.apifoxmock.com/m1/8972811-8778665-default/api/chat
 *   上传   https://m1.apifoxmock.com/m1/8972811-8778665-default/api/upload
 *
 * 实测现状（2026-10-28）：四个地址均可访问、返回结构符合契约，
 * 但 Apifox「智能 Mock」返回的是占位假数据（match_type 为随机文本，不是 original/similar/miss）。
 * 为保证前端能完整演示 原题/相似题/未命中 三态 UI，提供两级联调：
 *   - MOCK_MODE = 'apifox'：走真实 Mock 地址（验证请求管线、CORS 代理、错误处理）
 *   - MOCK_MODE = 'local' ：使用下方契约样例数据（保证三态 UI 可稳定演示），右上角悬浮面板可随时切换
 * 后端就绪后：把 MOCK_MODE 切回 'apifox' 并把 vite.config.js 代理指向本地后端即可。
 */

export const APIFOX_BASE = 'https://m1.apifoxmock.com/m1/8972811-8778665-default'
export const MISS_RESPONSE_ID = '342552720'

/** 默认联调模式：'apifox' | 'local' */
export const DEFAULT_MOCK_MODE = 'local'

/** match_type 元信息（与契约严格对齐：original / similar / miss） */
export const MATCH_TYPE_META = {
  original: { label: '原题', cls: 'success', desc: '题库已收录，展示核验解析' },
  similar: { label: '相似题', cls: 'warning', desc: '仅作参考展示，不可进入作答与追问流程' },
  miss: { label: '未命中', cls: 'danger', desc: '题库未收录，尝试结合题干与资料解题' }
}

/**
 * 本地契约样例数据（仅用于 UI 状态演示，非真实题库；标注清楚，遵守“防幻觉”红线）。
 * 样例围绕验收红线 #6 的 Cache 基准案例：四路组相联，组号占 2 位（应指出错误并计算组索引位数）。
 */
export const DEMO_DATA = {
  sourceLabel: '本地演示样例（非真实题库）',

  original: {
    match_type: 'original',
    question_data: {
      question_id: 'Q001',
      subject: '计算机组成原理',
      chapter: '存储系统',
      stem: '某计算机按字节编址，Cache 容量 64KB、主存块大小 64B，采用四路组相联映射，地址为 32 位。某同学说“该地址的组号占 2 位”。请判断该说法是否正确，并说明理由。',
      options: ['A. 正确，四路就是 2 位', 'B. 错误，组索引位数由组数决定', 'C. 无法确定', 'D. 正确，组号位数与路数相同'],
      answer: 'B',
      solution:
        '1. 行数 = Cache 容量 ÷ 块大小 = 64KB ÷ 64B = 1024 行；\n2. 四路组相联：组数 = 行数 ÷ 路数 = 1024 ÷ 4 = 256 组；\n3. 组索引位数 = log2(组数) = log2(256) = 8 位。\n结论：组号占 8 位而非 2 位，路数（4）≠ 组号位数。',
      review_state: 'verified',
      source_ref: '演示样例 · 组相联 Cache 计算规则（非真题出处，团队题库接入后替换）'
    },
    similar_questions: []
  },

  similar: {
    match_type: 'similar',
    question_data: null,
    similar_questions: [
      {
        question_id: 'S001',
        subject: '计算机组成原理',
        stem: '两路组相联 Cache，容量 32KB，块大小 32B，求组索引位数。',
        source_ref: '演示样例 · 变式题（非真题出处）'
      },
      {
        question_id: 'S002',
        subject: '计算机组成原理',
        stem: '全相联 Cache 与组相联 Cache 的替换策略比较。',
        source_ref: '演示样例 · 概念题（非真题出处）'
      }
    ]
  },

  miss: {
    match_type: 'miss',
    question_data: null,
    similar_questions: []
  },

  /** /api/chat 本地样例回复（按 mode 区分，遵守“引导不泄底”红线） */
  chat: {
    direct: {
      reply:
        '结论：该说法错误，组号应占 8 位。\n\n计算过程：\n1. 行数 = 容量 ÷ 块大小 = 64KB ÷ 64B = 1024 行；\n2. 四路组相联下，组数 = 行数 ÷ 路数 = 1024 ÷ 4 = 256 组；\n3. 组索引位数 = log2(组数) = log2(256) = 8 位。\n\n关键点：组号位数由“组数”决定，而不是由“路数”决定。“四路”表示每组包含 4 行，与组号位数没有直接换算关系。',
      tool_result: 'group_bits: 8',
      citations: ['演示样例 · 组相联 Cache 计算规则（非真题出处）']
    },
    guided: {
      reply:
        '先按三步推进，先不看最终答案：\n\n1. 行数 = Cache 容量 ÷ 块大小，先算出总行数；\n2. 四路组相联：组数 = 行数 ÷ 路数（4）；\n3. 组索引位数 = log2(组数)。\n\n请把第 2 步算出的“组数”告诉我，我们核对后再看组号位数，再对照题目里的“2 位”判断对错。',
      tool_result: '',
      citations: ['演示样例 · 组相联 Cache 计算规则（非真题出处）']
    }
  },

  /** 上传接口本地样例 */
  upload: {
    task_id: 'demo_task_001',
    extracted_text:
      'Cache 地址划分：行数 = 容量 ÷ 块大小；组相联映射下组数 = 行数 ÷ 路数；组索引位数 = log2(组数)。\n常见误区：把“路数”误当成“组号位数”。\n例题：64KB Cache、64B 块、四路组相联 → 256 组 → 组索引 8 位。',
    failure_details: []
  }
}
