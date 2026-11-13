import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

const stored = new Map()
globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
  removeItem: (key) => stored.delete(key)
}
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
let failures = 0
try {
  const { useHistoryStore } = await server.ssrLoadModule('/src/store/history.js')
  const { default: AnswerPanel } = await server.ssrLoadModule('/src/components/AnswerPanel.vue')
  const { default: SideNav } = await server.ssrLoadModule('/src/components/SideNav.vue')
  const { default: request } = await server.ssrLoadModule('/src/api/request.js')
  const { request: httpRequest, http } = await server.ssrLoadModule('/src/api/http.js')
  const { API_PATHS } = await server.ssrLoadModule('/src/api/paths.js')
  const { uploadErrorInfo } = await server.ssrLoadModule('/src/api/errors.js')
  const { uploadFile } = await server.ssrLoadModule('/src/api/upload.js')
  const { healthState, modelStatusLabel, refreshHealth, resetHealth } = await server.ssrLoadModule('/src/api/health.js')
  const { default: SearchView } = await server.ssrLoadModule('/src/views/SearchView.vue')
  const { chatRequest } = await server.ssrLoadModule('/src/api/chat.js')
  const { useMockStore } = await server.ssrLoadModule('/src/store/mock.js')
  const { useMaterialsStore } = await server.ssrLoadModule('/src/store/materials.js')
  const { useSearchStore } = await server.ssrLoadModule('/src/store/search.js')
  const { default: ResultView } = await server.ssrLoadModule('/src/views/ResultView.vue')
  async function check(name, run) {
    stored.clear()
    const pinia = createPinia()
    setActivePinia(pinia)
    const history = useHistoryStore(pinia)
    const search = useSearchStore(pinia)
    const materials = useMaterialsStore(pinia)
    async function render() {
      const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: ResultView }] })
      await router.push('/')
      const app = createSSRApp(ResultView)
      app.use(pinia)
      app.use(router)
      return renderToString(app)
    }
    try { await run({ history, search, materials, pinia, render }); console.log('PASS ' + name) }
    catch (error) { failures++; console.error('FAIL ' + name + ': ' + error.message) }
  }
  const question = {
    question_id: 'Q-TEST', subject: '计算机组成原理', chapter: '存储系统',
    stem: '一道用于测试的完整题目', options: [], answer: 'SECRET_ANSWER',
    solution: 'SECRET_SOLUTION', review_state: 'verified', source_ref: '自拟测试题'
  }
  const result = { match_type: 'original', question_data: question, similar_questions: [], source: 'local-demo' }

  await check('未命中追问携带原题与最近消息', ({ history }) => {
    history.createSession({ mode: 'guided', questionStem: '计算这道未收录的题目', userAnswer: '我的思路' })
    history.appendMessage(history.currentSessionId, { role: 'user', content: '请给我一个提示' })
    assert.deepEqual(history.currentMessages, [
      { role: 'user', content: '计算这道未收录的题目' },
      { role: 'user', content: '请给我一个提示' }
    ])
  })
  await check('长对话仍保留原题且仅携带最近三轮', ({ history }) => {
    history.createSession({ mode: 'direct', questionStem: '原始题干' })
    for (let i = 0; i < 10; i++) history.appendMessage(history.currentSessionId, { role: i % 2 ? 'assistant' : 'user', content: String(i) })
    assert.deepEqual(history.currentMessages.map(m => m.content), ['原始题干', '4', '5', '6', '7', '8', '9'])
  })
  await check('引导模式首次不显示参考答案和完整解析', async ({ history, search, render }) => {
    history.createSession({ mode: 'guided', questionId: question.question_id, questionStem: question.stem })
    search.setResult(result, { raw_input: question.stem, input_type: 'text' })
    const html = await render()
    assert.ok(!html.includes('SECRET_ANSWER'))
    assert.ok(!html.includes('SECRET_SOLUTION'))
  })
  await check('直接模式保留题库核验解析', async ({ history, search, render }) => {
    history.createSession({ mode: 'direct', questionId: question.question_id, questionStem: question.stem })
    search.setResult(result, { raw_input: question.stem, input_type: 'text' })
    const html = await render()
    assert.ok(html.includes('SECRET_ANSWER'))
    assert.ok(html.includes('SECRET_SOLUTION'))
  })
  await check('主动查看答案后显示并保存揭示状态', async ({ history, search, render }) => {
    const session = history.createSession({ mode: 'guided', questionId: question.question_id, questionStem: question.stem })
    history.revealAnswer(session.session_id)
    search.setResult(result, { raw_input: question.stem, input_type: 'text' })
    const html = await render()
    assert.ok(html.includes('SECRET_ANSWER'))
    assert.equal(JSON.parse(history.exportJSON()).sessions[0].answer_revealed, true)
  })
  await check('相似题保留参考但只对用户自己的题干开启答疑', async ({ history, search, render }) => {
    const session = history.createSession({ mode: 'guided', questionStem: '用户自己的题目', matchType: 'similar' })
    search.setResult({ match_type: 'similar', question_data: null, similar_questions: [question], source: 'local-demo' }, { raw_input: '用户自己的题目', input_type: 'text' })
    const html = await render()
    assert.ok(html.includes('class="answer-panel"'))
    assert.equal(session.question_id, null)
    assert.equal(history.currentMessages[0].content, '用户自己的题目')
  })
  await check('引导模式不提前显示确定性工具答案', async ({ history, search, render }) => {
    const session = history.createSession({ mode: 'guided', questionId: question.question_id, questionStem: question.stem })
    const message = history.appendMessage(session.session_id, { role: 'assistant', content: '请先计算总行数。' })
    message.tool_result = 'SECRET_TOOL'
    search.setResult(result, { raw_input: question.stem, input_type: 'text' })
    assert.ok(!(await render()).includes('SECRET_TOOL'))
  })

  await check('重复确认同一资料不产生重复条目', ({ materials }) => {
    const input = { title: '同一资料', file_type: 'text/plain', extracted_text: '已修正的同一段文字' }
    const first = materials.addFromUpload(input)
    const second = materials.addFromUpload(input)
    assert.equal(materials.items.length, 1)
    assert.equal(first.material_id, second.material_id)
  })
  await check('用户主动查看后本地演示可给出完整解答', async ({ history }) => {
    const session = history.createSession({ mode: 'guided', questionStem: 'Cache 基准题' })
    history.revealAnswer(session.session_id)
    useMockStore().setMode('local')
    const response = await chatRequest({
      session_messages: history.currentMessages, question_id: null, user_answer: '',
      mode: 'guided', context_chunks: []
    })
    assert.ok(response.reply.includes('结论：该说法错误，组号应占 8 位'))
  })
  await check('接口路径统一登记在 API_PATHS，组件不再各处拼 URL', () => {
    assert.equal(API_PATHS.search, '/search')
    assert.equal(API_PATHS.chat, '/chat')
    assert.equal(API_PATHS.upload, '/upload')
    assert.equal(API_PATHS.health, '/health')
    assert.equal(API_PATHS.recommend, '/recommend')
    assert.equal(API_PATHS.question, '/question')
    assert.ok(Object.isFrozen(API_PATHS))
  })

  await check('上传 415 保留后端 detail 文案，统一客户端上的错误形状一致', async () => {
    const body = { detail: { code: 'unsupported_type', message: '不支持的文件类型：.bin' } }
    // TD-02 之后两条入口共用同一实例，只需改一次 adapter
    const adapter = http.defaults.adapter
    const reject415 = async (config) => {
      throw { isAxiosError: true, config, response: { status: 415, data: body } }
    }
    http.defaults.adapter = reject415
    assert.equal(request.defaults, http.defaults, '旧入口必须与统一客户端共享同一实例')
    try {
      const oldErr = await uploadFile(new Blob(['x'], { type: 'application/octet-stream' })).then(() => null, (e) => e)
      const newErr = await httpRequest({ url: API_PATHS.upload, method: 'POST', data: {} }).then(() => null, (e) => e)
      for (const err of [oldErr, newErr]) {
        assert.equal(err.kind, 'http')
        assert.equal(err.status, 415)
        assert.equal(err.code, 'unsupported_type')
        assert.equal(err.detail, '不支持的文件类型：.bin')
        assert.equal(err.message, '不支持的文件类型：.bin')
        assert.ok(!/HTTP 415/.test(err.message), '不允许只显示状态码')
      }
      assert.deepEqual(Object.keys(oldErr).sort(), Object.keys(newErr).sort())
    } finally {
      http.defaults.adapter = adapter
    }
  })

  await check('上传 400/413/415 都能给出错误码与具体原因', () => {
    const cases = [
      [400, 'empty_file', '文件为空'],
      [413, 'file_too_large', '文件超过大小限制（上限 20MB）'],
      [415, 'unsupported_type', '不支持的文件类型：.bin']
    ]
    for (const [status, code, message] of cases) {
      // 后端新版本：带 code + detail.message，原样展示
      const withDetail = uploadErrorInfo({ kind: 'http', code, status, detail: message, message })
      assert.equal(withDetail.code, code)
      assert.equal(withDetail.status, status)
      assert.equal(withDetail.message, message)
      // 后端旧版本：只有状态码，也要按 400/413/415 映射到业务码与兜底文案
      const statusOnly = uploadErrorInfo({ kind: 'http', code: `HTTP_${status}`, status, message: `请求失败（HTTP ${status}）` })
      assert.equal(statusOnly.code, code)
      assert.ok(statusOnly.message.includes(message.split('：')[0].replace('（上限 20MB）', '')))
    }
  })

  await check('SearchView 上传 415 展示具体原因，不再只显示状态码', async ({ pinia }) => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: SearchView }]
    })
    await router.push('/')
    let view
    const app = createSSRApp(SearchView)
    app.use(pinia)
    app.use(router)
    app.mixin({
      created() {
        view = this.$.setupState
      }
    })
    await renderToString(app)
    const oldAdapter = request.defaults.adapter
    request.defaults.adapter = async (config) => {
      throw {
        isAxiosError: true,
        config,
        response: { status: 415, data: { detail: { code: 'unsupported_type', message: '不支持的文件类型：.bin' } } }
      }
    }
    try {
      const file =
        typeof File !== 'undefined'
          ? new File([new Uint8Array([1])], 'sample.bin', { type: 'application/octet-stream' })
          : Object.assign(new Blob([new Uint8Array([1])]), { name: 'sample.bin' })
      view.file = file
      await view.recognize()
      assert.equal(view.uploadError.code, 'unsupported_type')
      assert.equal(view.uploadError.status, 415)
      assert.equal(view.uploadError.message, '不支持的文件类型：.bin')
      assert.equal(view.uploading, false)
    } finally {
      request.defaults.adapter = oldAdapter
    }
  })

  await check('health 三态：已连接 / 未配置 / 未知，且不泄露 Key', async () => {
    const oldAdapter = http.defaults.adapter
    const reply = (data) => async (config) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
    try {
      resetHealth()
      http.defaults.adapter = reply({ status: 'ok', questions: 81, llm_configured: true, llm_model: 'deepseek-flash' })
      await refreshHealth({ force: true })
      assert.equal(healthState.status, 'connected')
      assert.equal(modelStatusLabel(healthState), '模型已连接（deepseek-flash）')
      assert.ok(!JSON.stringify(healthState).toLowerCase().includes('sk-'))

      resetHealth()
      http.defaults.adapter = reply({ status: 'ok', questions: 81, llm_configured: false })
      await refreshHealth({ force: true })
      assert.equal(healthState.status, 'unconfigured')
      assert.equal(modelStatusLabel(healthState), '模型未配置')

      resetHealth()
      http.defaults.adapter = async (config) => {
        throw { isAxiosError: true, config, response: { status: 500, data: {} } }
      }
      await refreshHealth({ force: true })
      assert.equal(healthState.status, 'unknown')
      assert.equal(modelStatusLabel(healthState), '模型状态未知')

      // 旧后端没有 llm 字段：不能猜成“已连接”
      resetHealth()
      http.defaults.adapter = reply({ status: 'ok', questions: 81 })
      await refreshHealth({ force: true })
      assert.equal(healthState.status, 'unknown')
    } finally {
      http.defaults.adapter = oldAdapter
      resetHealth()
    }
  })

  await check('侧栏按 health 显示模型已连接，不再固定“无模型连接”', async ({ pinia }) => {
    resetHealth()
    const oldAdapter = http.defaults.adapter
    http.defaults.adapter = async (config) => ({
      data: { status: 'ok', questions: 81, llm_configured: true, llm_model: 'deepseek-flash' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    })
    try {
      await refreshHealth({ force: true })
      const router = createRouter({
        history: createMemoryHistory(),
        routes: ['/', '/materials', '/history'].map((path) => ({ path, component: { render: () => null } }))
      })
      await router.push('/')
      const app = createSSRApp(SideNav)
      app.use(pinia)
      app.use(router)
      const html = await renderToString(app)
      assert.ok(html.includes('模型已连接（deepseek-flash）'))
      assert.ok(!html.includes('无模型连接'))
    } finally {
      http.defaults.adapter = oldAdapter
      resetHealth()
    }
  })

  for (const edited of [false, true]) {
    await check(edited ? '重试成功保留后来编辑的草稿' : '重试成功清除已发送的旧草稿', async ({ history, pinia }) => {
      const session = history.createSession({ mode: 'guided', questionStem: '未收录题目' })
      useMockStore().setMode('apifox')
      let view
      const app = createSSRApp(AnswerPanel, { sessionId: session.session_id })
      app.use(pinia)
      app.mixin({ created() { view = this.$.setupState } })
      await renderToString(app)
      const adapter = request.defaults.adapter
      let attempts = 0
      request.defaults.adapter = async (config) => {
        attempts++
        const payload = JSON.parse(config.data)
        assert.deepEqual(Object.keys(payload).sort(), ['context_chunks', 'mode', 'question_id', 'session_messages', 'user_answer'])
        assert.equal(payload.session_messages[0].content, '未收录题目')
        if (attempts === 1) throw { response: { status: 500 } }
        return { data: { reply: '这是一个提示', tool_result: '', citations: [] }, status: 200, statusText: 'OK', headers: {}, config }
      }
      try {
        view.draft = '请给我提示'
        await view.send()
        assert.equal(view.draft, '请给我提示')
        if (edited) view.draft = '后来编辑的另一个问题'
        await view.retry()
        assert.equal(view.draft, edited ? '后来编辑的另一个问题' : '')
        assert.equal(session.messages.filter(m => m.role === 'user').length, 1)
        assert.equal(session.messages.at(-1).content, '这是一个提示')
      } finally { request.defaults.adapter = adapter }
    })
  }
} finally { await server.close() }
if (failures) process.exitCode = 1
