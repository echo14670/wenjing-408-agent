/**
 * G 包本地回归证据生成器（G4）。
 *
 * 覆盖三件事，输出可直接归档的 JSON：
 *   1) 学习记录：导出 → 清空 → 重新导入 → 数据仍在（含消息数）；
 *   2) 答疑链路：本地个人资料进入 `context_chunks`，随 /api/chat 请求发出；
 *   3) 请求体字段：session_messages / question_id / user_answer / mode / context_chunks 齐全。
 *
 * 运行：
 *   cd frontend && node scripts/g-evidence.mjs
 * 输出：
 *   frontend/docs/evidence-g/history-and-context.json
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, '../docs/evidence-g')

const stored = new Map()
const localStorageMock = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: (key) => stored.delete(key),
  clear: () => stored.clear(),
  key: (i) => [...stored.keys()][i] ?? null,
  get length() {
    return stored.size
  }
}
globalThis.localStorage = localStorageMock
globalThis.window = { localStorage: localStorageMock }

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const mod = (p) => server.ssrLoadModule('/src/' + p)
  const { http } = await mod('api/http.js')
  const { useAnswerFlow } = await mod('composables/useAnswerFlow.js')
  const { useHistoryStore } = await mod('store/history.js')
  const { useWjMaterialsStore } = await mod('store/wjMaterials.js')
  const { useMockStore } = await mod('store/mock.js')

  setActivePinia(createPinia())
  useMockStore().setMode('backend')

  /* ---------------- 1. 学习记录导出 / 清空 / 导入 ---------------- */
  const history = useHistoryStore()
  const session = history.createSession({
    mode: 'guided',
    questionStem: '某计算机按字节编址，Cache 容量 64KB，主存块大小 64B，四路组相联，地址 32 位。判断“组号占 2 位”。',
    userAnswer: '我认为四路就是四组'
  })
  history.appendMessage(session.session_id, { role: 'user', content: '为什么组数不是 4？' })
  history.appendMessage(session.session_id, { role: 'assistant', content: '四路表示每组 4 行，组数 = 行数 ÷ 路数。' })
  const exported = history.exportJSON()
  const exportedObj = JSON.parse(exported)
  const before = { sessions: history.sessions.length, messages: session.messages.length }
  history.clearAll()
  const cleared = { sessions: history.sessions.length }
  const imported = history.importJSON(exported)
  const restoredSession = history.sessions[0]
  const after = {
    sessions: history.sessions.length,
    messages: restoredSession?.messages.length ?? 0,
    restoredStem: restoredSession?.question_stem ?? ''
  }
  assert.deepEqual(before, { sessions: 1, messages: 2 })
  assert.equal(cleared.sessions, 0)
  assert.equal(imported, 1)
  assert.equal(after.sessions, 1)
  assert.equal(after.messages, 2)
  assert.equal(after.restoredStem, session.question_stem)

  /* ---------------- 2. 资料进入 context_chunks ---------------- */
  stored.clear()
  setActivePinia(createPinia())
  useMockStore().setMode('backend')
  const materials = useWjMaterialsStore()
  materials.addFromText(
    'Cache 笔记.md',
    '组相联映射：组数 = 行数 ÷ 路数；组索引位数 = log2(组数)。四路表示每组四条 Cache 行。'
  )
  const requests = []
  const originalAdapter = http.defaults.adapter
  http.defaults.adapter = async (config) => {
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    requests.push({ url: config.url, body, at: new Date().toISOString() })
    const data =
      config.url === '/search'
        ? { match_type: 'miss', question_data: null, similar_questions: [] }
        : { reply: '先算总行数，再除以路数得到组数。', tool_result: '', citations: [] }
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
  let chatBody
  try {
    const flow = useAnswerFlow()
    await flow.load({
      q: '某计算机 Cache 容量 64KB，主存块大小 64B，四路组相联，求组索引位数。',
      mode: 'guided',
      scenario: 'auto'
    })
    chatBody = requests.find((r) => r.url === '/chat')?.body
  } finally {
    http.defaults.adapter = originalAdapter
  }
  assert.ok(chatBody, '答疑请求未发出')
  assert.deepEqual(Object.keys(chatBody).sort(), [
    'context_chunks',
    'mode',
    'question_id',
    'session_messages',
    'user_answer'
  ])
  assert.ok(Array.isArray(chatBody.context_chunks) && chatBody.context_chunks.length > 0)
  assert.ok(chatBody.context_chunks.some((c) => c.includes('组数 = 行数 ÷ 路数')))
  assert.equal(chatBody.mode, 'guided')
  assert.equal(chatBody.question_id, null)

  const evidence = {
    generated_at: new Date().toISOString(),
    package: 'G（郑志銮）',
    baseline: 'main@f4606f6',
    history_roundtrip: {
      exported_bytes: Buffer.byteLength(exported),
      export_version: exportedObj.version,
      before_clear: before,
      after_clear: cleared,
      imported_sessions: imported,
      after_import: after
    },
    chat_context: {
      request_url: '/api/chat',
      request_keys: Object.keys(chatBody).sort(),
      context_chunk_count: chatBody.context_chunks.length,
      context_chunks: chatBody.context_chunks,
      session_message_count: chatBody.session_messages.length,
      mode: chatBody.mode,
      question_id: chatBody.question_id,
      user_answer: chatBody.user_answer
    }
  }
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'history-and-context.json')
  fs.writeFileSync(outFile, JSON.stringify(evidence, null, 2), 'utf8')
  console.log(JSON.stringify(evidence, null, 2))
  console.log('\nwritten: ' + outFile)
} finally {
  await server.close()
}
