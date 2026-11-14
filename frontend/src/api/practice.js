/**
 * 同考点推荐 / 新题详情的接口封装（Alpha · §3.8 / TD-06）。
 *
 * 后端正式契约（docs/api-contract.md §4、backend/app/api/recommend.py）：
 *   POST /api/recommend
 *     请求 { question_id, done_question_ids, top_k, include_unverified }
 *     响应 { questions: QuestionData[], scope, notice }
 *   GET  /api/question/{question_id}（C 包待实现，作为可选补充）
 *
 * 本轮清偿的原则，和「防幻觉」红线一致：
 *   1. **真实路径不兜底**：404 / 5xx / 超时 / 网络错误一律原样抛出，UI 显示错误与重试；
 *      questions=[] 就是真的没有，保持空态，绝不拿内置样例把空结果填上。
 *   2. **示例数据只在显式演示入口**：DevMockSwitch 切到演示模式、或 URL 带 ?mock= 场景时，
 *      才返回内置样例，并返回 demo=true 让 UI 打「示例数据」标。
 *   3. **详情不是唯一数据源**：推荐响应里的 QuestionData 已经是完整题目（含答案与解析），
 *      详情接口只补空字段；它没上线时切题照常可用，也不把真实题误标成示例。
 *   4. **验收注入显式化**：?rec=none / error / slow 只模拟状态，不注入任何假题目。
 */
import { request } from './client'
import { API_PATHS, questionPath } from './paths'
import { normalizeQuestion, normalizeRecommend } from './normalize'
import { isPlaceholder } from '@/mock/garbage'
import { practiceCandidates } from '@/mock/fixtures/practiceCandidates'
import { buildRecommendPayload, mergeQuestionDetail } from '@/utils/practice'

const RECOMMEND_TIMEOUT_MS = 6000
const DETAIL_TIMEOUT_MS = 8000
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function usableStem(stem) {
  return !isPlaceholder(stem) && String(stem ?? '').trim().length >= 6
}

/**
 * 拉取同考点候选。
 * @param {{questionId?: string, doneQuestionIds?: string[], chapter?: string,
 *          knowledgePoint?: string, subject?: string, limit?: number,
 *          includeUnverified?: boolean}} payload
 * @param {{demo?: boolean, variant?: 'auto'|'none'|'error'|'slow', signal?: AbortSignal}} opts
 *        demo=true 表示用户显式选择了演示模式；variant 来自 ?rec= 验收开关。
 */
export async function fetchRecommendations(payload = {}, opts = {}) {
  const variant = opts.variant ?? 'auto'
  const demo = opts.demo === true
  const topK = Math.min(10, Math.max(1, Number(payload.limit) || 3))

  // 验收注入：显式 URL 参数，只制造状态，不制造题目
  if (variant === 'none') {
    return {
      candidates: [],
      scope: 'none',
      notice: '',
      knowledgePoint: payload.knowledgePoint ?? '',
      demo,
      note: '演示场景：后端返回空候选'
    }
  }
  if (variant === 'error') {
    throw {
      kind: 'http',
      code: 'HTTP_502',
      status: 502,
      message: '推荐服务暂不可用（HTTP 502）',
      detail: '演示场景：/api/recommend 返回错误',
      retryable: true
    }
  }
  if (variant === 'slow') await delay(3500)

  // 显式演示模式：内置样例，界面必须标「示例数据」
  if (demo) {
    return {
      candidates: practiceCandidates.map((item) => ({ ...item })),
      scope: 'knowledge_point',
      notice: '',
      knowledgePoint: payload.knowledgePoint ?? '',
      demo: true,
      note: '演示数据：非真实题库'
    }
  }

  // ---- 真实路径：一次请求，不做任何静默回落 ----
  if (!payload.questionId) {
    throw {
      kind: 'unknown',
      code: 'NO_QUESTION_ID',
      message: '当前题目缺少题号，无法请求同考点推荐',
      detail: '请先用完整题干检索到已核验原题，再点「再练一道」。'
    }
  }
  const raw = await request({
    url: API_PATHS.recommend,
    method: 'POST',
    data: buildRecommendPayload({ ...payload, limit: topK }),
    timeout: RECOMMEND_TIMEOUT_MS,
    signal: opts.signal
  })

  const normalized = normalizeRecommend(raw)
  // 整份响应都是占位乱码时判为「服务返回不可读」，走错误态且可重试，
  // 而不是把乱码过滤掉后悄悄换成内置样例。
  const valid = normalized.candidates.filter((c) => usableStem(c.stem))
  if (normalized.candidates.length > 0 && valid.length === 0) {
    throw {
      kind: 'http',
      code: 'PLACEHOLDER_RESPONSE',
      status: 200,
      message: '推荐接口返回的内容不可读',
      detail: '后端返回的题干为占位文本，请检查服务版本后重试。',
      retryable: true
    }
  }
  return {
    candidates: valid,
    scope: normalized.scope,
    notice: normalized.notice,
    knowledgePoint: normalized.knowledgePoint ?? payload.knowledgePoint ?? '',
    demo: false,
    note: ''
  }
}

/**
 * 取新题详情。
 *
 * 推荐响应已经包含完整 QuestionData，所以这里以候选对象为主数据；
 * `GET /api/question/{id}` 只作为可选补充（C 包合入后自动生效）。
 * 返回 demo 仅表示「数据来自显式演示模式」，不再是「接口失败后的兜底」。
 */
export async function resolvePracticeQuestion(candidate, opts = {}) {
  if (!candidate || !candidate.stem) {
    throw { kind: 'unknown', code: 'NO_CANDIDATE', message: '候选题面缺失，无法开始练习' }
  }
  const demo = opts.demo === true
  const question = normalizeQuestion({
    question_id: candidate.id ?? candidate.questionId,
    subject: candidate.subject,
    chapter: candidate.chapter,
    stem: candidate.stem,
    options: candidate.options,
    answer: candidate.answer,
    solution: candidate.solution,
    source_ref: candidate.sourceRef,
    review_state: candidate.reviewState,
    steps: candidate.steps,
    hints: candidate.hints,
    segments: candidate.segments
  })
  if (!question) {
    throw { kind: 'unknown', code: 'NO_CANDIDATE', message: '候选题面缺失，无法开始练习' }
  }

  if (demo || !question.questionId) {
    return { question, demo, detailStatus: 'skipped', detailNote: '' }
  }
  try {
    const raw = await request({
      url: questionPath(question.questionId),
      method: 'GET',
      timeout: DETAIL_TIMEOUT_MS,
      signal: opts.signal
    })
    const detail = normalizeQuestion(raw?.question_data ?? raw)
    if (detail && detail.stem.trim() && !isPlaceholder(detail.stem)) {
      return { question: mergeQuestionDetail(question, detail), demo: false, detailStatus: 'ok', detailNote: '' }
    }
    return {
      question,
      demo: false,
      detailStatus: 'unusable',
      detailNote: '详情接口返回内容不可读，已使用推荐响应中的题目'
    }
  } catch (err) {
    // 详情接口未上线或短暂故障：不阻塞练习，也不把真实题降级成示例数据
    return {
      question,
      demo: false,
      detailStatus: 'unavailable',
      detailNote: `详情接口不可用（${err?.code ?? 'HTTP 404'}），已使用推荐响应中的题目`
    }
  }
}
