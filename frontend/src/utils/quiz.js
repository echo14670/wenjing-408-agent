/**
 * 小测纯函数（无 Vue / 无别名依赖，可被 node 直跑单测）。
 *
 * 对应 Beta §08：出卷只有题面和选项，标准答案在交卷后才由后端返回；
 * 浏览器只存 attempt_id、题组版本、所选项和判分结果，判分一律以后端为准。
 */

export const DEFAULT_QUIZ_ID = 'co-memory-01'
export const DEFAULT_QUIZ_TITLE = '存储器层次结构'
export const ATTEMPT_STATUS = Object.freeze({ draft: 'draft', submitted: 'submitted' })

/** 出卷响应归一化：后端字段缺失时降级，不抛错；绝不从别处补答案 */
export function normalizeQuiz(raw) {
  if (!raw || typeof raw !== 'object') return null
  const questions = Array.isArray(raw.questions)
    ? raw.questions
        .map((q, i) => {
          if (!q || typeof q !== 'object') return null
          const questionId = String(q.question_id ?? '').trim()
          const stem = String(q.stem ?? '').trim()
          if (!questionId || !stem) return null
          const options = Array.isArray(q.options)
            ? q.options.map(option => String(option ?? '')).filter(Boolean)
            : []
          return {
            questionId,
            stem,
            options,
            sourceRef: String(q.source_ref ?? '').trim(),
            index: i + 1
          }
        })
        .filter(Boolean)
    : []
  if (!questions.length) return null
  return {
    quizId: String(raw.quiz_id ?? DEFAULT_QUIZ_ID).trim(),
    version: String(raw.version ?? '1').trim(),
    title: String(raw.title ?? DEFAULT_QUIZ_TITLE).trim(),
    questions
  }
}

/** 判分响应归一化：只保留契约字段，缺解析也不影响分数展示 */
export function normalizeQuizResult(raw) {
  if (!raw || typeof raw !== 'object') return null
  const results = Array.isArray(raw.results)
    ? raw.results.map(item => ({
        questionId: String(item?.question_id ?? '').trim(),
        selected: String(item?.selected ?? '').trim(),
        correct: String(item?.correct ?? '').trim(),
        isCorrect: Boolean(item?.is_correct),
        solution: String(item?.solution ?? '')
      })).filter(item => item.questionId)
    : []
  return {
    quizId: String(raw.quiz_id ?? DEFAULT_QUIZ_ID).trim(),
    version: String(raw.version ?? '1').trim(),
    attemptId: String(raw.attempt_id ?? '').trim(),
    score: Number(raw.score) || 0,
    total: Number(raw.total) || results.length,
    results
  }
}

/** 按选项数量生成字母；后端以 A/B/... 判分，不能按题号硬写四个 */
export function optionLetters(options) {
  return (options ?? []).map((_, i) => String.fromCharCode(65 + i))
}

/** 未选满时给出缺题题号，交卷前不请求后端 */
export function missingQuestions(questions, answers) {
  return (questions ?? []).map(q => q.questionId).filter(id => !String(answers?.[id] ?? '').trim())
}

/** 交卷请求体：只发已选题号，额外题号由后端再校验一次 */
export function buildSubmitPayload(quiz, attemptId, answers) {
  const clean = {}
  for (const q of quiz?.questions ?? []) {
    const value = String(answers?.[q.questionId] ?? '').trim().toUpperCase()
    if (value) clean[q.questionId] = value
  }
  // 后端 RecommendRequest 风格的 snake_case 契约：attempt_id / answers
  return {
    version: String(quiz?.version ?? '1'),
    attempt_id: String(attemptId ?? ''),
    answers: clean
  }
}

/** 成绩单状态文字：颜色只做辅助，文字必须能单独说明结果 */
export function resultLabel(item) {
  if (!item?.selected) return '未作答'
  return item.isCorrect ? '正确' : '错误'
}

/**
 * 作答摘要：给学习列表与龚巍斌的历史入口用。
 * 未交卷显示进度，已交卷显示分数；标题短，能区分两次作答。
 */
export function attemptSummary(attempt) {
  if (!attempt) return null
  // 未交卷时 total 还是 0，用建卷时记下的题数；已交卷用后端判分的总数
  const total = Number(attempt.total) || Number(attempt.questionCount) || Number(attempt.result?.total) || 0
  const answered = Object.keys(attempt.answers ?? {}).filter(
    id => String(attempt.answers[id] ?? '').trim()
  ).length
  const submitted = attempt.status === ATTEMPT_STATUS.submitted
  return {
    attemptId: attempt.attemptId,
    quizId: attempt.quizId,
    version: attempt.version,
    title: attempt.title ?? '',
    status: submitted ? '已交卷' : '未交卷',
    detail: submitted
      ? `${attempt.score ?? 0}/${total} 分`
      : `已答 ${answered}/${total} 题`,
    updatedAt: Number(attempt.updatedAt) || 0
  }
}

/** 已作答题目集合只保留合法字母，避免把脏答案发给后端 */
export function cleanAnswers(answers, questions) {
  const allowed = new Map((questions ?? []).map(q => [q.questionId, optionLetters(q.options)]))
  const clean = {}
  for (const [qid, value] of Object.entries(answers ?? {})) {
    const letters = allowed.get(qid)
    const letter = String(value ?? '').trim().toUpperCase()
    if (letters?.includes(letter)) clean[qid] = letter
  }
  return clean
}
