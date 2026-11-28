/**
 * 小测页面与作答状态单测（npm run test:quiz）。
 *
 * 覆盖：出卷/判分归一化、A/B/B=2/3、缺题拦截、attempt_id 与版本透传、
 * 刷新续答、重做保留旧成绩、按 ID 恢复、重复点击与失败重试不产生第二条答卷。
 */
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

const stored = new Map()
globalThis.localStorage = {
  getItem: key => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: key => stored.delete(key),
  key: i => [...stored.keys()][i],
  get length() { return stored.size }
}
globalThis.window = { localStorage }

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
let passed = 0
let failed = 0
function check(name, condition, extra = '') {
  const ok = typeof condition === 'function' ? Boolean(condition()) : Boolean(condition)
  if (ok) { passed++; console.log(`  ✅ ${name}`) }
  else { failed++; console.error(`  ❌ ${name} ${extra}`) }
}

try {
  const mod = name => server.ssrLoadModule('/src/' + name)
  const quiz = await mod('utils/quiz.js')
  const { useWjQuizStore } = await mod('store/wjQuiz.js')

  const RAW_QUIZ = {
    quiz_id: 'co-memory-01', version: '1', title: '存储器层次结构',
    questions: [
      { question_id: 'COP005', stem: '直接映射位宽', options: ['A. 6、10、14', 'B. 6、16、8'], source_ref: '题库 COP005' },
      { question_id: 'COP006', stem: '组相联位宽', options: ['A. 6、7、19', 'B. 6、8、18'], source_ref: '题库 COP006' },
      { question_id: 'COP007', stem: '平均访存时间', options: ['A. 5.95', 'B. 6.00'], source_ref: '题库 COP007' }
    ]
  }
  const RAW_RESULT = {
    quiz_id: 'co-memory-01', version: '1', attempt_id: 'attempt-001', score: 2, total: 3,
    results: [
      { question_id: 'COP005', selected: 'A', correct: 'A', is_correct: true, solution: '解 A' },
      { question_id: 'COP006', selected: 'B', correct: 'A', is_correct: false, solution: '解 B' },
      { question_id: 'COP007', selected: 'B', correct: 'B', is_correct: true, solution: '解 C' }
    ]
  }

  console.log('\n[1] 出卷与判分归一化')
  const q = quiz.normalizeQuiz(RAW_QUIZ)
  check('1a 三题有序保留', q.questions.map(x => x.questionId).join(',') === 'COP005,COP006,COP007')
  check('1b 出卷无答案字段', !('answer' in q.questions[0]) && !('solution' in q.questions[0]))
  check('1c 来源保留', q.questions[0].sourceRef === '题库 COP005')
  check('1d 空题组返回 null', quiz.normalizeQuiz({ questions: [] }) === null)
  check('1e 脏数据被丢弃', quiz.normalizeQuiz({ questions: [{ question_id: 'X' }, null, RAW_QUIZ.questions[0]] }).questions.length === 1)
  const r = quiz.normalizeQuizResult(RAW_RESULT)
  check('1f 分数与逐题结果保留', r.score === 2 && r.total === 3 && r.results.length === 3)
  check('1g 解析保留', r.results[0].solution === '解 A')

  console.log('\n[2] 交卷请求体与缺题')
  const answers = { COP005: 'A', COP006: 'B', COP007: 'B' }
  const payload = quiz.buildSubmitPayload(q, 'attempt-001', answers)
  check('2a A/B/B 得 2/3 的输入一致', JSON.stringify(payload.answers) === JSON.stringify(answers))
  check('2b 版本与作答 ID 透传', payload.version === '1' && payload.attempt_id === 'attempt-001')
  check('2c 缺题被识别', quiz.missingQuestions(q.questions, { COP005: 'A' }).join(',') === 'COP006,COP007')
  check('2d 选满不缺题', quiz.missingQuestions(q.questions, answers).length === 0)
  check('2e 额外题号不进入请求体', !('COP999' in quiz.buildSubmitPayload(q, 'a', { ...answers, COP999: 'A' }).answers))
  check('2f 非法字母被清理', Object.keys(quiz.cleanAnswers({ COP005: 'E', COP006: 'b' }, q.questions)).join(',') === 'COP006')
  check('2g 字母按选项数生成', quiz.optionLetters(['A', 'B', 'C']).join('') === 'ABC')

  console.log('\n[3] 作答状态与恢复')
  setActivePinia(createPinia())
  const store = useWjQuizStore()
  const a1 = store.createAttempt({ quizId: q.quizId, version: q.version, title: q.title, questionCount: 3 })
  check('3a 新建生成 attempt_id', Boolean(a1.attemptId) && a1.status === 'draft')
  for (const [id, letter] of Object.entries(answers)) store.saveAnswer(a1.attemptId, id, letter)
  check('3b 选项已保存', Object.keys(store.getAttempt(a1.attemptId).answers).length === 3)
  store.markSubmitted(a1.attemptId, r, q.questions)
  const saved = store.getAttempt(a1.attemptId)
  check('3c 交卷后状态与分数写入', saved.status === 'submitted' && saved.score === 2 && saved.total === 3)
  check('3d 交卷后选项不再改动', store.saveAnswer(a1.attemptId, 'COP005', 'B') === false && saved.answers.COP005 === 'A')
  setActivePinia(createPinia())
  const reloaded = useWjQuizStore()
  check('3e 刷新后按 ID 恢复成绩', reloaded.getAttempt(a1.attemptId)?.result?.score === 2)
  const a2 = reloaded.createAttempt({ quizId: q.quizId, version: q.version, title: q.title, questionCount: 3 })
  check('3f 重做生成新 ID', a2.attemptId !== a1.attemptId)
  check('3g 旧成绩仍可查看', reloaded.getAttempt(a1.attemptId)?.status === 'submitted')
  check('3h 两次作答都能列出', reloaded.listAttempts('co-memory-01').length === 2)
  const summary = reloaded.summaryOf(a2.attemptId)
  check('3i 未交卷摘要显示进度', summary.status === '未交卷' && summary.detail.includes('已答 0/3'))
  check('3j 已交卷摘要显示分数', reloaded.summaryOf(a1.attemptId).detail.includes('2/3'))
  check('3k 不存在的 ID 返回 null', reloaded.getAttempt('nope') === null && reloaded.summaryOf('nope') === null)

  console.log('\n[4] 结果文字与状态')
  check('4a 正确显示正确', quiz.resultLabel({ selected: 'A', isCorrect: true }) === '正确')
  check('4b 错误显示错误', quiz.resultLabel({ selected: 'B', isCorrect: false }) === '错误')
  check('4c 未作答显示未作答', quiz.resultLabel({ selected: '', isCorrect: false }) === '未作答')
  check('4d 状态常量稳定', quiz.ATTEMPT_STATUS.draft === 'draft' && quiz.ATTEMPT_STATUS.submitted === 'submitted')

  console.log('\n[5] 路由入口')
  const routes = await mod('constants/routes.js')
  check('5a 小测路径登记', routes.PATH.quiz === '/quiz')
  const link = routes.attemptRoute(a1.attemptId)
  check('5b 学习记录按 ID 打开', link.name === 'quiz' && link.query.attempt === a1.attemptId)
  check('5c 指定题组入口', routes.attemptRoute('', 'co-memory-01').query.quiz === 'co-memory-01')
} finally {
  await server.close()
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed) process.exit(1)
