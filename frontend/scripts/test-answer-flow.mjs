import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

const stored = new Map()
globalThis.localStorage = {
  getItem: k => stored.get(k) ?? null,
  setItem: (k, v) => stored.set(k, String(v)),
  removeItem: k => stored.delete(k),
  key: i => [...stored.keys()][i],
  get length() { return stored.size }
}
globalThis.window = { localStorage }
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
let failures = 0
try {
  const mod = path => server.ssrLoadModule('/src/' + path)
  const { http } = await mod('api/http.js')
  const { useAnswerFlow } = await mod('composables/useAnswerFlow.js')
  const { useSessionStore } = await mod('store/session.js')
  const { useHistoryStore } = await mod('store/history.js')
  const { useMaterialsStore } = await mod('store/materials.js')
  const { useMockStore } = await mod('store/mock.js')
  const { useSearchStore } = await mod('store/search.js')
  const { useStepParser } = await mod('composables/useStepParser.js')
  const { uploadFile } = await mod('api/endpoints.js')
  const stem = '一道用户自己输入的网络题，条件与 Cache 无关'
  const question = { question_id: 'NET-1', subject: '计算机网络', stem, answer: 'B', solution: '1. 检查路由前缀\n2. 选择最长匹配', review_state: 'verified', source_ref: '团队原创网络题' }
  async function check(name, run) {
    stored.clear()
    setActivePinia(createPinia())
    useMockStore().setMode('backend')
    const session = useSessionStore()
    const history = useHistoryStore()
    const materials = useMaterialsStore()
    const requests = []
    let match = 'miss'
    let failChat = false
    http.defaults.adapter = async config => {
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
      requests.push({ url: config.url, body })
      if (config.url === '/chat' && failChat) throw { isAxiosError: true, response: { status: 503, data: {} } }
      const data = config.url === '/search'
        ? { match_type: match, question_data: match === 'original' ? question : null, similar_questions: match === 'similar' ? [{ question_id: 'REF-2', stem: '仅供参考的另一道题' }] : [] }
        : config.url === '/upload' ? { task_id: 'empty-upload', extracted_text: '', failure_details: ['未能识别文件'] }
          : { reply: '请先列出你需要比较的网络前缀条件。', tool_result: '', citations: [] }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    try {
      await run({ session, history, materials, requests, flow: useAnswerFlow(), setMatch: v => { match = v }, setFail: v => { failChat = v } })
      console.log('PASS ' + name)
    } catch (e) { failures++; console.error('FAIL ' + name + ': ' + e.message) }
  }
  await check('首次未命中答疑携带用户原题，空资料/来源/工具保持为空', async ({ flow, requests, session, materials }) => {
    await flow.load({ q: stem, mode: 'guided', scenario: 'auto' })
    const body = requests.find(r => r.url === '/chat')?.body
    assert.equal(body.session_messages[0].content, stem)
    assert.equal(body.question_id, null)
    assert.deepEqual(body.context_chunks, [])
    assert.equal(materials.items.length, 0)
    assert.deepEqual(session.lastReply.citations, [])
    assert.ok(!session.lastReply.toolResult)
    assert.equal(session.status, 'miss')
  })
  await check('相似候选不绑定为原题，用户仍可围绕自己的题干追问', async ({ flow, requests, setMatch }) => {
    setMatch('similar')
    await flow.load({ q: stem, mode: 'guided' })
    assert.ok(await flow.followUp('请解释我的原题条件'))
    const chats = requests.filter(r => r.url === '/chat')
    assert.equal(chats.length, 2)
    for (const r of chats) {
      assert.equal(r.body.question_id, null)
      assert.equal(r.body.session_messages[0].content, stem)
    }
  })
  await check('新页面记录进入现有历史，现有个人资料进入答疑上下文', async ({ flow, history, materials, requests }) => {
    materials.addFromUpload({ title: '我的网络笔记', file_type: 'text', extracted_text: '网络前缀比较应采用最长匹配。' })
    await flow.load({ q: stem, mode: 'direct' })
    assert.equal(history.sessions.length, 1)
    assert.equal(history.currentSession.question_stem, stem)
    assert.ok(history.currentSession.messages.some(m => m.role === 'assistant'))
    assert.ok(requests.find(r => r.url === '/chat').body.context_chunks.some(c => c.includes('最长匹配')))
  })
  await check('长对话保留原题和主动查看答案的意图', async ({ flow, session, requests }) => {
    await flow.load({ q: stem, mode: 'guided' })
    flow.revealAnswer()
    for (let i = 0; i < 9; i++) session.addMessage({ role: i % 2 ? 'assistant' : 'user', content: '消息' + i })
    await flow.followUp('现在结合完整答案解释')
    const body = requests.filter(r => r.url === '/chat').at(-1).body
    assert.equal(body.session_messages[0].content, stem)
    assert.ok(body.session_messages.some(m => m.content.includes('我已主动选择查看答案')))
    assert.ok(body.session_messages.length <= 8)
  })
  await check('追问失败重试不会新增重复用户消息', async ({ flow, session, setFail }) => {
    await flow.load({ q: stem, mode: 'direct' })
    setFail(true)
    assert.equal(await flow.followUp('这一步为什么'), false)
    setFail(false)
    await flow.retryChat()
    assert.equal(session.messages.filter(m => m.role === 'user' && m.content === '这一步为什么').length, 1)
    assert.equal(session.chatStatus, 'success')
  })
  await check('搜索入口已有结果复用同一会话，不重复检索', async ({ flow, history, requests, session }) => {
    const previous = history.createSession({ mode: 'guided', questionStem: stem, userAnswer: '我的网络思路', matchType: 'original', questionId: question.question_id })
    useSearchStore().setResult({ match_type: 'original', question_data: question, similar_questions: [], source: 'backend' }, { raw_input: stem, input_type: 'image' })
    await flow.load({ q: stem, mode: 'guided', sessionId: previous.session_id })
    assert.equal(requests.filter(r => r.url === '/search').length, 0)
    assert.equal(history.sessions.length, 1)
    assert.equal(session.myThought, '我的网络思路')
    assert.equal(requests.find(r => r.url === '/chat').body.question_id, question.question_id)
  })
  await check('历史恢复重建结果和上下文，不停留加载态、不重复调用模型', async ({ flow, session, requests }) => {
    await flow.load({ q: stem, mode: 'guided' })
    flow.revealAnswer()
    session.reset()
    const count = requests.length
    await useAnswerFlow().load({ q: stem, mode: 'guided', allowRestore: true })
    assert.equal(requests.length, count)
    assert.equal(session.status, 'miss')
    assert.ok(session.result)
    assert.equal(session.answerRevealed, true)
    assert.ok(session.messages.length)
  })
  await check('切换教学模式保留原有对话及查看答案状态', async ({ flow, session, history, requests }) => {
    await flow.load({ q: stem, mode: 'guided' })
    await flow.followUp('我已经完成前缀比较，请看我的思路')
    flow.revealAnswer()
    const oldIds = session.messages.map(m => m.id)
    const id = session.historyId
    await flow.ensure({ q: stem, mode: 'direct', sessionId: id, allowRestore: true })
    assert.ok(oldIds.every(id => session.messages.some(m => m.id === id)))
    assert.equal(session.answerRevealed, true)
    assert.equal(history.currentSession.session_id, id)
    assert.ok(requests.filter(r => r.url === '/chat').at(-1).body.session_messages.some(m => m.content.includes('已经完成前缀比较')))
  })
  await check('旧历史没有检索快照时继续答疑不覆盖已有消息', async ({ flow, history, session }) => {
    const old = history.createSession({ mode: 'guided', questionStem: stem })
    history.appendMessage(old.session_id, { role: 'user', content: '旧会话中的思路' })
    history.appendMessage(old.session_id, { role: 'assistant', content: '旧会话中的提示' })
    await flow.load({ q: stem, mode: 'guided', sessionId: old.session_id, allowRestore: true })
    assert.ok(session.messages.some(m => m.content === '旧会话中的思路'))
    assert.ok(history.currentSession.messages.some(m => m.content === '旧会话中的提示'))
  })
  await check('失败追问刷新恢复后仍显示错误并可重试', async ({ flow, session, requests, setFail }) => {
    await flow.load({ q: stem, mode: 'guided' })
    setFail(true)
    await flow.followUp('这条追问暂时没有回答')
    const sid = session.historyId
    session.reset()
    const count = requests.length
    const restored = useAnswerFlow()
    await restored.load({ q: stem, mode: 'guided', sessionId: sid, allowRestore: true })
    assert.equal(requests.length, count)
    assert.equal(session.chatStatus, 'error')
    assert.ok(session.chatError)
    setFail(false)
    await restored.retryChat()
    assert.equal(session.chatStatus, 'success')
    assert.equal(session.messages.filter(m => m.content === '这条追问暂时没有回答').length, 1)
  })
  await check('真实上传失败保持空文本和失败信息', async () => {
    const res = await uploadFile(new Blob(['invalid'], { type: 'text/plain' }))
    assert.equal(res.extractedText, '')
    assert.deepEqual(res.failures, ['未能识别文件'])
  })
  await check('真实题目解析不套 Cache 模板或分段图', async () => {
    const parser = useStepParser()
    assert.deepEqual(parser.stepsFor('original', '', 'direct', 'B'), [])
    assert.deepEqual(parser.segmentsFor('64位 Cache 标记和组索引如何划分'), [])
    assert.ok(parser.stepsFor('miss', '1. 检查网络前缀\n2. 采用最长匹配', 'direct').every(s => !s.detail.includes('Cache')))
  })
} finally { await server.close() }
if (failures) process.exitCode = 1
