/**
 * 同考点推荐 / 新题详情的接口封装。
 *
 * 设计前提：这两个端点是"增强能力"，契约尚未并入 Apifox。
 * 因此策略与 /search 的「真请求 + 文案兜底」保持一致：
 *   1. 请求照发 —— 证明链路真实存在，后端一上线就自动生效；
 *   2. 404 / 网络不可达才回落内置示例候选 —— 不能因为推荐没上线就让答案页白屏；
 *   3. 5xx、超时照常抛错 —— 那是真的故障，必须让用户看见并能重试。
 */
import { request } from './http'
import { normalizeQuestion, normalizeRecommend } from './normalize'
import { isPlaceholder } from '@/mock/garbage'
import { practiceCandidates } from '@/mock/fixtures/practiceCandidates'

const RECOMMEND_TIMEOUT_MS = 6000
const DETAIL_TIMEOUT_MS = 8000

function shouldFallback(err) {
  if (!err) return true
  // 断网、契约未就绪（404/405/501）、以及开发代理没起后端时的 5xx，都按"接口不可用"处理。
  // 推荐是增强入口，不该因为它挂了就把答案页打成错误态。
  if (err.kind === 'network') return true
  if (err.status === 404 || err.status === 405 || err.status === 501) return true
  if (typeof err.status === 'number' && err.status >= 500) return true
  return false
}

/**
 * 拉取同考点候选。
 * @param {{questionId?: string|null, knowledgePoint?: string, subject?: string, limit?: number}} payload
 * @param {{variant?: 'auto'|'none'|'error'|'slow', signal?: AbortSignal}} opts
 *        variant 仅用于演示空态/错误态（?rec=none / ?rec=error）
 */
export async function fetchRecommendations(payload = {}, opts = {}) {
  const variant = opts.variant ?? 'auto'
  const limit = payload.limit ?? 3
  if (variant === 'none') {
    return {
      candidates: [],
      knowledgePoint: payload.knowledgePoint ?? '',
      fromFallback: false,
      note: '演示场景：接口返回空候选'
    }
  }
  if (variant === 'error') {
    throw {
      kind: 'http',
      code: 'HTTP_502',
      status: 502,
      message: '推荐服务暂不可用（HTTP 502）',
      detail: '演示场景：/api/recommend 返回错误'
    }
  }
  if (variant === 'slow') {
    await new Promise((resolve) => setTimeout(resolve, 3500))
  }

  let raw = null
  let fromFallback = false
  let note = ''
  try {
    raw = await request({
      url: '/recommend',
      method: 'GET',
      params: { question_id: payload.questionId ?? undefined, limit },
      timeout: RECOMMEND_TIMEOUT_MS,
      signal: opts.signal
    })
  } catch (err) {
    if (!shouldFallback(err)) throw err
    fromFallback = true
    note =
      err.kind === 'network'
        ? '推荐接口不可达，已使用内置示例候选'
        : err.status === 404 || err.status === 405 || err.status === 501
          ? `推荐接口返回 ${err.code ?? 'HTTP 404'}（契约未就绪），已使用内置示例候选`
          : `推荐接口异常（${err.code ?? 'HTTP 5xx'}），已使用内置示例候选`
  }

  const normalized = normalizeRecommend(raw)
  // 接口给了结构但文案是占位拉丁串时，同样按"没有候选"处理，避免把乱码推荐给用户
  const usable = normalized.candidates.filter((c) => !isPlaceholder(c.stem) && c.stem.trim().length >= 6)
  if (!usable.length) {
    fromFallback = true
    note =
      normalized.candidates.length > 0
        ? '推荐接口返回的是占位文本，已使用内置示例候选'
        : note || '推荐接口未返回候选，已使用内置示例候选'
  }
  const candidates = usable.length ? usable : practiceCandidates
  return {
    candidates,
    knowledgePoint: normalized.knowledgePoint ?? payload.knowledgePoint ?? '',
    fromFallback,
    note
  }
}

/**
 * 取新题详情。
 *
 * 真后端应提供 `GET /api/question/{id}`；Mock 未配置时回落到候选自带的题面。
 * 注意：回落出来的题会带上 `sample: true`，页面必须标注"示例数据"，
 * 不能让人误以为这是题库里核验过的原文。
 */
export async function resolvePracticeQuestion(candidate) {
  if (!candidate || !candidate.stem) {
    throw { kind: 'unknown', code: 'NO_CANDIDATE', message: '候选题面缺失，无法开始练习' }
  }
  if (candidate.id) {
    try {
      const raw = await request({
        url: `/question/${encodeURIComponent(candidate.id)}`,
        method: 'GET',
        timeout: DETAIL_TIMEOUT_MS
      })
      const question = normalizeQuestion(raw?.question_data ?? raw)
      if (question && question.stem.trim() && !isPlaceholder(question.stem)) {
        return { question, fromFallback: false }
      }
    } catch {
      // 详情接口失败不影响"开始练习"这件事：候选对象本身已经够渲染，
      // 只是整体降级为示例数据，UI 会打「示例数据」标。
      // 这里刻意不抛错——推荐已成功时把用户挡在门外，体验上说不通。
    }
  }
  const question = normalizeQuestion({
    question_id: candidate.id,
    subject: candidate.subject,
    stem: candidate.stem,
    answer: candidate.answer,
    source_ref: candidate.sourceRef,
    review_state: candidate.reviewState,
    steps: candidate.steps,
    hints: candidate.hints,
    segments: candidate.segments
  })
  return { question, fromFallback: true }
}
