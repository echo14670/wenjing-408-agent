/** 路由名与路径生成，避免字符串散落各处 */
export const ROUTE = {
  entry: 'entry',
  answer: 'answer',
  steps: 'steps',
  teaching: 'teaching',
  notFound: 'not-found'
}
export const PATH = {
  entry: '/',
  classic: '/classic',
  result: '/result',
  history: '/history',
  materials: '/materials',
  answer: '/answer',
  steps: '/steps',
  teaching: '/teaching',
  /** 三题小测：?quiz=题组ID&attempt=作答ID */
  quiz: '/quiz'
}
export function withQuery(path, query) {
  const clean = {}
  for (const key of ['sid', 'q', 'mock', 'mode', 'practice']) {
    const value = query[key]
    if (typeof value === 'string' && value) clean[key] = value
  }
  return { path, query: clean }
}

/** 学习记录按作答 ID 打开小测草稿或成绩；龚巍斌的历史入口用这个函数接线 */
export function attemptRoute(attemptId, quizId = '') {
  const query = {}
  if (quizId) query.quiz = quizId
  if (attemptId) query.attempt = attemptId
  return { name: 'quiz', query }
}

export function buildQuestionShareUrl(router, questionId, pageUrl) {
  const page = new URL(pageUrl)
  const { href } = router.resolve({ name: 'workbench', query: { practice: questionId } })
  return new URL(href, page.origin + page.pathname).href
}
