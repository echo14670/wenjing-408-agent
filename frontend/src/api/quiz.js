/**
 * 固定题组小测接口（Beta §08）。
 *
 * 契约见 docs/api-contract.md §7：
 *   GET  /api/quiz/{quiz_id}            → 出卷（不含答案与解析）
 *   POST /api/quiz/{quiz_id}/submit     → 按版本判分
 *
 * 这里只做请求与字段归一化，不在前端算分、不缓存标准答案。
 * 错误由统一客户端 client.js 抛 AppError，页面负责显示可读原因并保留作答。
 */
import { request } from './client'
import { quizPath, quizSubmitPath } from './paths'
import { normalizeQuiz, normalizeQuizResult, buildSubmitPayload } from '../utils/quiz'

/** 出卷：只取作答所需字段 */
export async function fetchQuiz(quizId, opts = {}) {
  const raw = await request({
    url: quizPath(quizId),
    method: 'GET',
    timeout: opts.timeout ?? 10000,
    signal: opts.signal
  })
  const quiz = normalizeQuiz(raw)
  if (!quiz) {
    throw {
      kind: 'unknown',
      code: 'QUIZ_EMPTY',
      message: '题组没有可作答的题目',
      detail: '后端返回的题组为空或缺少题干，请稍后重试。'
    }
  }
  return quiz
}

/**
 * 交卷：payload 由纯函数生成，重试复用同一 attempt_id。
 * 后端按题组版本判分；同版本同选项的分数保持一致。
 */
export async function submitQuiz(quizId, quiz, attemptId, answers, opts = {}) {
  const payload = buildSubmitPayload(quiz, attemptId, answers)
  const raw = await request({
    url: quizSubmitPath(quizId),
    method: 'POST',
    data: payload,
    timeout: opts.timeout ?? 15000,
    signal: opts.signal
  })
  const result = normalizeQuizResult(raw)
  if (!result) {
    throw {
      kind: 'unknown',
      code: 'QUIZ_RESULT_INVALID',
      message: '判分结果无法读取',
      detail: '交卷请求已发出，但返回内容不完整，请用同一作答重试。'
    }
  }
  return result
}
