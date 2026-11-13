/**
 * 统一请求层验收（Alpha · TD-02 / §3.7）。
 *
 * 与 test-contract 的分工：
 *   - test-contract 验证业务形状（三态、引导不泄底、上传错误文案）；
 *   - 本脚本验证**传输层**本身：单实例、超时、取消、multipart、错误映射、重试信息。
 *
 * 关键做法：除「配置读取」两项外，其余用例都通过一台本地真实 HTTP 服务往返，
 * 不使用 axios adapter 打桩，避免“只测了假实现”。
 */
import assert from 'node:assert/strict'
import nodeHttp from 'node:http'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createServer as createViteServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

/* ------------------------------------------------------------------ *
 * 0. 运行环境：localStorage 垫片（mock store 会读取）
 * ------------------------------------------------------------------ */
const stored = new Map()
globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
  removeItem: (key) => stored.delete(key)
}

/* ------------------------------------------------------------------ *
 * 1. 本地真实 HTTP 服务
 * ------------------------------------------------------------------ */
let serverCase = 'ok'
const hits = []

function json(res, status, data, headers = {}) {
  const body = Buffer.from(JSON.stringify(data))
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    ...headers
  })
  res.end(body)
}

const server = nodeHttp.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    const contentType = req.headers['content-type'] || ''
    hits.push({ method: req.method, path: url.pathname, contentType, bytes: body.length })

    if (url.pathname === '/api/search') {
      if (serverCase === 'empty') {
        return json(res, 200, { match_type: 'miss', question_data: null, similar_questions: [] })
      }
      if (serverCase === 'slow-search') return // 故意不返回，用于取消
      return json(res, 200, {
        match_type: 'original',
        question_data: { question_id: 'Q1', stem: '真实题干', answer: '真实答案', review_state: 'verified' },
        similar_questions: []
      })
    }

    if (url.pathname === '/api/upload') {
      // 统一客户端不预设 JSON 头：非 multipart 说明传输规则退化，直接按契约报 422
      if (!contentType.includes('multipart/form-data')) {
        return json(res, 422, {
          detail: [{ loc: ['body', 'file'], msg: 'Expected multipart/form-data', type: 'value_error' }]
        })
      }
      const kind = url.searchParams.get('case')
      if (kind === '400') return json(res, 400, { detail: { code: 'empty_file', message: '文件为空，请重新选择' } })
      if (kind === '413') {
        return json(res, 413, { detail: { code: 'file_too_large', message: '文件超过大小限制（上限 20MB）' } })
      }
      if (kind === '415') {
        return json(res, 415, { detail: { code: 'unsupported_type', message: '不支持的文件类型：.bin' } })
      }
      if (kind === '422') {
        return json(res, 422, { detail: [{ loc: ['body', 'file'], msg: 'field required' }] })
      }
      if (kind === 'html500') {
        res.writeHead(500, { 'Content-Type': 'text/html' })
        return res.end('<!DOCTYPE html><html><body>Internal Server Error</body></html>')
      }
      return json(res, 200, { task_id: 'T1', extracted_text: '识别文本', failure_details: [] })
    }

    if (url.pathname === '/api/chat') {
      if (serverCase === '503') {
        return json(
          res,
          503,
          { detail: { code: 'llm_unavailable', message: '模型暂不可用', retryable: true } },
          { 'Retry-After': '30' }
        )
      }
      if (serverCase === '502') {
        return json(res, 502, { detail: { code: 'llm_error', message: '云端模型调用失败', retryable: true } })
      }
      return json(res, 200, { reply: '真实讲解', tool_result: '', citations: [] })
    }

    if (url.pathname === '/api/slow') return // 挂起：用于超时/取消

    // 服务端直接断开：客户端拿到 ECONNRESET（无 response），用于验证“网络错误”
    if (url.pathname === '/api/reset') {
      req.socket.destroy()
      return
    }

    json(res, 404, { detail: 'not found' })
  })
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const PORT = server.address().port
const BASE = `http://127.0.0.1:${PORT}/api`

/* ------------------------------------------------------------------ *
 * 2. 加载前端模块
 * ------------------------------------------------------------------ */
const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'custom' })
let failures = 0

async function check(name, run) {
  stored.clear()
  setActivePinia(createPinia())
  try {
    await run()
    console.log('PASS ' + name)
  } catch (error) {
    failures++
    console.error('FAIL ' + name + ': ' + error.message)
  }
}

const { http: client, request, toAppError, isCanceled } = await vite.ssrLoadModule('/src/api/client.js')
const { default: legacyRequest } = await vite.ssrLoadModule('/src/api/request.js')
const { API_PATHS } = await vite.ssrLoadModule('/src/api/paths.js')
const { uploadErrorInfo, errorText } = await vite.ssrLoadModule('/src/api/errors.js')
const { uploadFile } = await vite.ssrLoadModule('/src/api/upload.js')
const { chatRequest } = await vite.ssrLoadModule('/src/api/chat.js')
const { searchQuestion } = await vite.ssrLoadModule('/src/api/search.js')
const { useSearchStore } = await vite.ssrLoadModule('/src/store/search.js')
const { refreshHealth, resetHealth } = await vite.ssrLoadModule('/src/api/health.js')
const { isDemoMode } = await vite.ssrLoadModule('/src/store/mock.js')
const { DEFAULT_MOCK_MODE } = await vite.ssrLoadModule('/src/config/mock.js')
const { REQUEST_TIMEOUT_MS, CHAT_TIMEOUT_MS } = await vite.ssrLoadModule('/src/constants/limits.js')

const prevBase = client.defaults.baseURL
client.defaults.baseURL = BASE

/* ------------------------------------------------------------------ *
 * 3. 用例
 * ------------------------------------------------------------------ */

await check('单一 axios 实例：src 内只有 client.js 一处 axios.create', () => {
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(js|mjs|vue)$/.test(name)) files.push(full)
    }
  }
  walk('src')
  const creators = files.filter((file) => /axios\.create\s*\(/.test(readFileSync(file, 'utf8')))
  assert.deepEqual(
    creators.map((file) => file.replace(/\\/g, '/')),
    ['src/api/client.js'],
    'axios.create 只允许出现在 client.js'
  )
  const importers = files.filter((file) => /from ['"]axios['"]/.test(readFileSync(file, 'utf8')))
  assert.deepEqual(
    importers.map((file) => file.replace(/\\/g, '/')),
    ['src/api/client.js'],
    '除 client.js 外不允许直接 import axios'
  )
})

await check('旧入口 request.js / http.js 只做转发，与统一客户端共享同一份 defaults', () => {
  assert.equal(legacyRequest.defaults, client.defaults)
  assert.equal(legacyRequest.interceptors, client.interceptors)
  assert.equal(typeof legacyRequest.post, 'function')
  assert.equal(client.defaults.timeout, REQUEST_TIMEOUT_MS)
})

await check('默认不预设 Content-Type，避免 FormData 被 JSON 序列化', () => {
  const defaults = client.defaults.headers
  const contentType =
    defaults?.common?.['Content-Type'] ??
    defaults?.post?.['Content-Type'] ??
    defaults?.get?.['Content-Type']
  assert.equal(contentType, undefined, '客户端默认头里不允许写死 Content-Type')
})

await check('上传真实往返：multipart/form-data 带 boundary，服务端收到文件', async () => {
  const before = hits.length
  const file =
    typeof File !== 'undefined'
      ? new File([new Uint8Array([1, 2, 3])], 'note.txt', { type: 'text/plain' })
      : new Blob([new Uint8Array([1, 2, 3])], { type: 'text/plain' })
  const res = await uploadFile(file)
  assert.equal(res.task_id, 'T1')
  assert.equal(res.extracted_text, '识别文本')
  const seen = hits[before]
  assert.equal(seen.path, '/api/upload')
  assert.ok(/^multipart\/form-data; boundary=/.test(seen.contentType), `实际 Content-Type=${seen.contentType}`)
  assert.ok(seen.bytes > 0)
})

await check('正常检索走真实后端：source=backend，question_data 完整', async () => {
  serverCase = 'ok'
  const before = hits.length
  const result = await searchQuestion({ raw_input: '真实题干', input_type: 'text' })
  assert.equal(result.match_type, 'original')
  assert.equal(result.source, 'backend')
  assert.equal(result.question_data.question_id, 'Q1')
  assert.equal(hits.length, before + 1)
})

await check('空结果：200 + 无 question_data 正常返回，不抛错', async () => {
  serverCase = 'empty'
  const result = await searchQuestion({ raw_input: '题库未收录', input_type: 'text' })
  assert.equal(result.match_type, 'miss')
  assert.equal(result.question_data, null)
  assert.deepEqual(result.similar_questions, [])
  serverCase = 'ok'
})

await check('400/413/415 实际 HTTP：业务码与可读原因都对得上', async () => {
  const cases = [
    ['400', 400, 'empty_file', '文件为空'],
    ['413', 413, 'file_too_large', '文件超过大小限制'],
    ['415', 415, 'unsupported_type', '不支持的文件类型：.bin']
  ]
  for (const [kind, status, code, text] of cases) {
    const form = new FormData()
    form.append('file', new Blob(['x']), 'x.bin')
    const err = await request({
      url: API_PATHS.upload,
      method: 'POST',
      data: form,
      params: { case: kind }
    }).then(() => null, (e) => e)
    assert.ok(err, `${kind} 应当抛错`)
    assert.equal(err.kind, 'http')
    assert.equal(err.status, status)
    assert.equal(err.code, code)
    assert.ok(err.message.includes(text), `${kind} 文案=${err.message}`)
    assert.ok(!/HTTP \d{3}/.test(err.message), '不允许只显示状态码')
    assert.equal(uploadErrorInfo(err).code, code)
  }
})

await check('422 FastAPI 校验错误：合并 detail 数组，不把 HTML/object 直接打到界面', async () => {
  const form = new FormData()
  form.append('file', new Blob(['x']), 'x.txt')
  const err = await request({
    url: API_PATHS.upload,
    method: 'POST',
    data: form,
    params: { case: '422' }
  }).then(() => null, (e) => e)
  assert.equal(err.status, 422)
  assert.equal(err.code, 'validation_error')
  assert.ok(err.message.includes('field required'), err.message)

  const html = await request({
    url: API_PATHS.upload,
    method: 'POST',
    data: form,
    params: { case: 'html500' }
  }).then(() => null, (e) => e)
  assert.equal(html.status, 500)
  assert.ok(!html.message.includes('<'), 'HTML 错误页不能进 message')
  assert.ok(html.message.includes('500'), html.message)
})

await check('503：保留 retryable 与 Retry-After 头（30 秒）', async () => {
  serverCase = '503'
  const err = await chatRequest({ session_messages: [{ role: 'user', content: '题' }], mode: 'direct' }).then(
    () => null,
    (e) => e
  )
  assert.equal(err.status, 503)
  assert.equal(err.code, 'llm_unavailable')
  assert.equal(err.retryable, true)
  assert.equal(err.retryAfterSeconds, 30)
  assert.ok(err.message.includes('模型暂不可用'))
  serverCase = 'ok'
})

await check('502：可读文案 + retryable，仍走同一错误形状', async () => {
  serverCase = '502'
  const err = await chatRequest({ session_messages: [{ role: 'user', content: '题' }], mode: 'guided' }).then(
    () => null,
    (e) => e
  )
  assert.equal(err.status, 502)
  assert.equal(err.retryable, true)
  for (const key of ['kind', 'code', 'status', 'detail', 'message']) {
    assert.ok(key in err, `缺少字段 ${key}`)
  }
  serverCase = 'ok'
})

await check('网络错误：连接被服务端重置 → kind=network，不误判为超时', async () => {
  // 让本地服务端直接销毁 socket：客户端得到 ECONNRESET（无 response），
  // 不依赖“端口未监听/域名解析”在不同机器上的差异
  const err = await request({ url: '/reset', timeout: 2000 }).then(() => null, (e) => e)
  assert.equal(err.kind, 'network', `实际 ${JSON.stringify(err)}`)
  assert.equal(err.code, 'NETWORK')
  assert.equal(err.status, undefined)
  assert.ok(err.message.includes('网络'))
})

await check('超时：真实慢响应 + 150ms 超时 → kind=timeout，文案不以 0 秒糊弄', async () => {
  const err = await request({ url: '/slow', timeout: 150 }).then(() => null, (e) => e)
  assert.equal(err.kind, 'timeout')
  assert.equal(err.code, 'TIMEOUT')
  assert.ok(/毫秒|秒/.test(err.message), err.message)
  assert.ok(!/（0 秒/.test(err.message), err.message)
})

await check('取消：真实中断 → kind=canceled，文案不是“网络不可达”', async () => {
  const controller = new AbortController()
  const pending = request({ url: '/slow', signal: controller.signal }).then(() => null, (e) => e)
  setTimeout(() => controller.abort(), 60)
  const err = await pending
  assert.ok(isCanceled(err), `实际 kind=${err.kind} code=${err.code}`)
  assert.equal(err.kind, 'canceled')
  assert.equal(err.code, 'CANCELED')
  assert.equal(errorText(err), '请求已取消')
  assert.ok(!/网络|故障|失败/.test(errorText(err)))
})

await check('store/search 取消不写 error，loading 归位', async () => {
  const search = useSearchStore()
  serverCase = 'slow-search'
  const controller = new AbortController()
  const pending = search
    .runSearch({ raw_input: '取消用例', input_type: 'text' }, { signal: controller.signal })
    .then(() => null, (e) => e)
  setTimeout(() => controller.abort(), 60)
  const err = await pending
  assert.ok(isCanceled(err))
  assert.equal(search.error, null)
  assert.equal(search.loading, false)
  serverCase = 'ok'
})

await check('答疑保留 120s 长超时，health 保持 5s 短超时', async () => {
  const prevAdapter = client.defaults.adapter
  const captured = []
  client.defaults.adapter = async (config) => {
    captured.push(config)
    return { data: { reply: 'ok', citations: [] }, status: 200, statusText: 'OK', headers: {}, config }
  }
  try {
    await chatRequest({ session_messages: [{ role: 'user', content: '题' }], mode: 'direct' })
    assert.equal(captured.at(-1).timeout, CHAT_TIMEOUT_MS)
    assert.equal(CHAT_TIMEOUT_MS, 120000)

    resetHealth()
    await refreshHealth({ force: true })
    assert.equal(captured.at(-1).timeout, 5000)
  } finally {
    client.defaults.adapter = prevAdapter
    resetHealth()
  }
})

await check('生产默认连真实后端；演示只在显式选择时启用', async () => {
  assert.equal(DEFAULT_MOCK_MODE, 'backend')
  assert.equal(isDemoMode('backend'), false)
  assert.equal(isDemoMode('apifox'), false)
  assert.equal(isDemoMode('original'), true)

  serverCase = 'ok'
  const before = hits.length
  const demo = await searchQuestion({ raw_input: '显式演示', input_type: 'text' }, { mock: 'original' })
  assert.equal(demo.source, 'local-demo')
  assert.equal(hits.length, before, '显式演示不应发起真实请求')

  const real = await searchQuestion({ raw_input: '真实', input_type: 'text' })
  assert.equal(real.source, 'backend')
  assert.equal(hits.length, before + 1)
})

await check('旧入口 request.js 转发可用：返回值仍是响应体，错误仍是 AppError', async () => {
  const data = await legacyRequest.post(API_PATHS.search, { raw_input: 'x', input_type: 'text' })
  assert.equal(data.match_type, 'original')

  const err = await legacyRequest
    .post(API_PATHS.upload, new FormData(), { params: { case: '415' } })
    .then(() => null, (e) => e)
  assert.equal(err.code, 'unsupported_type')
  assert.equal(err.status, 415)
  assert.equal(toAppError(err), err, 'AppError 二次转换应原样返回')
})

/* ------------------------------------------------------------------ *
 * 4. 收尾
 * ------------------------------------------------------------------ */
client.defaults.baseURL = prevBase
await vite.close()
server.closeAllConnections?.()
await new Promise((resolve) => server.close(resolve))

if (failures) {
  console.error(`\n请求层验收：${failures} 项失败`)
  process.exit(1)
}
console.log('\n请求层验收：全部通过')
