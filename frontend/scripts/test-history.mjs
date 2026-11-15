import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

const stored = new Map()
let blocked = false
globalThis.localStorage = {
  getItem: key => stored.get(key) ?? null,
  setItem: (key, value) => {
    if (blocked) throw new Error('quota exceeded')
    stored.set(key, String(value))
  },
  removeItem: key => stored.delete(key),
  key: i => [...stored.keys()][i],
  get length() { return stored.size }
}
globalThis.window = { localStorage }
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
let passed = 0, failed = 0
try {
  const mod = name => server.ssrLoadModule('/src/' + name)
  const { useHistoryStore } = await mod('store/history.js')
  const { useWjHistoryStore } = await mod('store/wjHistory.js')
  const { useSessionStore } = await mod('store/session.js')
  const { useAnswerFlow } = await mod('composables/useAnswerFlow.js')
  const { useMockStore } = await mod('store/mock.js')
  const { http } = await mod('api/http.js')
  function fresh() { setActivePinia(createPinia()); return useHistoryStore() }
  function record(id = 'A', mode = 'guided') {
    return { sessionId: id, questionId: `Q-${id}`, stem: `题目 ${id} 的完整题干及选项`, mode,
      matchType: 'original', userThought: `作答 ${id}`, userReasoning: `思路 ${id}`,
      answerRevealed: id === 'A',
      messages: [{ id: `msg-${id}`, role: 'assistant', content: `讲解 ${id}`, kind: 'hint',
        citations: [`来源 ${id}`], tool_result: `计算 ${id}`, createdAt: 1700000000000 }],
      result: { matchType: 'original', source: 'backend', fromMockFallback: false,
        question: { questionId: `Q-${id}`, stem: `题目 ${id} 的完整题干及选项`, options: ['A', 'B'], answer: 'A' } },
      lastReply: { reply: `讲解 ${id}`, citations: [{ text: `来源 ${id}` }], toolResult: `计算 ${id}` },
      chatStatus: 'success', chatError: null }
  }
  const backup = sessions => JSON.stringify({ version: 1, sessions })
  async function check(name, run) {
    stored.clear(); blocked = false
    try { await run(fresh()); passed++; console.log('PASS ' + name) }
    catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.stack) }
  }
  await check('新旧调用写入同一存储和会话，省略字段不丢失', history => {
    const old = history.createSession({ mode: 'guided', questionStem: '旧页面输入', userReasoning: '保留思路' })
    const adapted = useWjHistoryStore().upsert({ sessionId: old.session_id, userThought: '补充作答' })
    assert.equal(history.sessions.length, 1)
    assert.equal(adapted.stem, '旧页面输入')
    assert.equal(adapted.userReasoning, '保留思路')
    assert.equal(adapted.userThought, '补充作答')
    assert.deepEqual([...stored.keys()], ['wenjing:history:v1'])
  })
  await check('导出清空导入并重新创建 store 后完整恢复', history => {
    useWjHistoryStore().upsert(record())
    const expected = JSON.parse(history.exportJSON()).sessions
    const exported = history.exportJSON()
    history.clearAll()
    assert.equal(history.importJSON(exported), 1)
    const reloaded = fresh()
    assert.deepEqual(JSON.parse(reloaded.exportJSON()).sessions, expected)
    assert.equal(useWjHistoryStore().getSession('A').userReasoning, '思路 A')
    assert.deepEqual(reloaded.sessions[0].messages[0].citations, ['来源 A'])
  })
  await check('旧 canonical v1 与缺省版本备份仍可导入', history => {
    const old = { session_id: 'old', mode: 'direct', question_stem: '旧题',
      messages: [{ role: 'user', content: '旧作答' }] }
    assert.equal(history.importJSON(backup([old])), 1)
    assert.equal(history.importJSON(JSON.stringify({ sessions: [{ ...old, session_id: 'older' }] })), 1)
    assert.equal(history.sessions.length, 2)
  })
  await check('旧 camelCase 完整记录及引用、揭示状态兼容', history => {
    const raw = { ...record('old'), id: 'old', attempt: { referenceExposed: true } }
    delete raw.sessionId; delete raw.answerRevealed
    assert.equal(history.importJSON(backup([raw])), 1)
    assert.equal(history.sessions[0].answer_revealed, true)
    assert.equal(useWjHistoryStore().getSession('old').result.question.questionId, 'Q-old')
  })
  await check('旧摘要记录保留且不伪造完整题干', history => {
    history.importJSON(backup([{ id: 'short', stemSummary: '被截断的摘要…', userAnswerDigest: '旧理解',
      mode: 'guided', messages: [] }]))
    assert.equal(history.sessions[0].legacy_incomplete, true)
    assert.equal(history.sessions[0].question_stem, '')
    assert.equal(history.sessions[0].title, '被截断的摘要…')
    assert.equal(history.sessions[0].answer_attempt.user_answer, '旧理解')
  })
  await check('重复导入返回实际新增 0，已有内容不被覆盖', history => {
    history.upsertSession(record())
    const raw = JSON.parse(history.exportJSON())
    raw.sessions[0].question_stem = '不应覆盖'
    assert.equal(history.importJSON(JSON.stringify(raw)), 0)
    assert.equal(history.currentSession.question_stem, record().stem)
  })
  await check('批内和库内重复、无效条目计数准确', history => {
    history.upsertSession(record('A'))
    const p = history.previewImport(backup([record('A'), record('B'), record('B'), { session_id: 'bad' }]))
    assert.equal(p.total, 4)
    assert.equal(p.candidates.length, 1)
    assert.equal(p.skipped.length, 2)
    assert.equal(p.invalid.length, 1)
    assert.deepEqual(history.confirmImport(p), { added: 1, skipped: 2, invalid: 1 })
    assert.equal(new Set(history.sessions.map(s => s.session_id)).size, 2)
  })
  await check('预览后取消不改变内存和持久化数据', history => {
    history.upsertSession(record('A'))
    const before = [...stored]
    history.previewImport(backup([record('B')]))
    assert.equal(history.sessions.length, 1)
    assert.deepEqual([...stored], before)
  })
  await check('预览后新建同 ID 会话，确认时重新去重', history => {
    const p = history.previewImport(backup([record('B')]))
    history.upsertSession({ ...record('B'), userThought: '预览期间新增' })
    assert.deepEqual(history.confirmImport(p), { added: 0, skipped: 1, invalid: 0 })
    assert.equal(history.sessions[0].answer_attempt.user_answer, '预览期间新增')
  })
  await check('损坏 JSON、未知版本和错误格式整体拒绝且不写入', history => {
    history.upsertSession(record())
    const before = history.exportJSON(), disk = [...stored]
    for (const text of ['{', 'null', '[]', '{"sessions":{}}',
      '{"version":2,"sessions":[]}', '{"format":"other","sessions":[]}']) {
      assert.throws(() => history.importJSON(text))
    }
    assert.deepEqual(JSON.parse(history.exportJSON()).sessions, JSON.parse(before).sessions)
    assert.deepEqual([...stored], disk)
  })
  await check('消息格式或模式错误逐条拒绝，其余有效项仍可确认', history => {
    const p = history.previewImport(backup([{ ...record(), mode: 'exam' },
      { ...record(), messages: [{ role: 'user', content: {} }] }, record('C')]))
    assert.equal(p.invalid.length, 2)
    assert.deepEqual(history.confirmImport(p), { added: 1, skipped: 0, invalid: 2 })
  })
  await check('写入失败时导入保持原内存与磁盘不变', history => {
    history.upsertSession(record('A'))
    const p = history.previewImport(backup([record('B')])), disk = [...stored]
    blocked = true
    assert.throws(() => history.confirmImport(p), /原有历史保持不变/)
    assert.equal(history.sessions.length, 1)
    assert.deepEqual([...stored], disk)
    history.persist()
    assert.ok(history.persistenceError)
    assert.equal(history.importJSON(backup([record('A')])), 0)
    assert.ok(history.persistenceError, '没有落盘的重复导入不能清除存储失败提示')
    blocked = false
    assert.equal(history.confirmImport(p).added, 1)
    assert.equal(history.persistenceError, '')
  })
  await check('兼容视图深拷贝消息和结果，不串改历史', history => {
    history.upsertSession(record())
    const v = useWjHistoryStore().getSession('A')
    v.messages[0].content = '临时消息'; v.result.question.stem = '临时题干'
    v.lastReply.citations[0].text = '临时来源'
    assert.equal(history.sessions[0].messages[0].content, '讲解 A')
    assert.equal(history.sessions[0].result_snapshot.question.stem, record().stem)
    assert.equal(history.sessions[0].last_reply.citations[0].text, '来源 A')
  })
  await check('追加消息、作答更新、揭示和最近对话仍支持旧入口', history => {
    const a = history.upsertSession(record())
    history.updateAnswerAttempt(a.session_id, { user_answer: 'B' })
    assert.equal(a.answer_attempt.user_reasoning, '思路 A')
    history.appendMessage(a.session_id, { role: 'user', content: '追问' })
    history.revealAnswer(a.session_id)
    assert.ok(history.messagesForSession(a.session_id).some(m => m.content.includes('主动选择查看答案')))
    assert.equal(history.currentMessages.at(-1).content, '追问')
    history.setCurrent('does-not-exist')
    assert.equal(history.currentSession, null)
  })
  await check('A/B/A 真实流程恢复不重复请求，不串题、作答、模式或揭示状态', async history => {
    history.upsertSession(record('A', 'guided'))
    history.upsertSession(record('B', 'direct'))
    setActivePinia(createPinia())
    useMockStore().setMode('backend')
    let requests = 0
    http.defaults.adapter = () => { requests++; throw new Error('恢复不应调用网络') }
    const flow = useAnswerFlow(), session = useSessionStore()
    for (const [id, mode, revealed] of [['A', 'guided', true], ['B', 'direct', false], ['A', 'guided', true]]) {
      await flow.load({ q: record(id).stem, sessionId: id, mode, scenario: 'auto', allowRestore: true })
      assert.equal(session.historyId, id)
      assert.equal(session.rawInput, record(id).stem)
      assert.equal(session.myThought, `作答 ${id}`)
      assert.equal(session.mode, mode)
      assert.equal(session.answerRevealed, revealed)
      assert.equal(session.lastReply.citations[0].text, `来源 ${id}`)
      assert.equal(session.result.question.questionId, `Q-${id}`)
    }
    assert.equal(requests, 0)
  })
} finally { await server.close() }
console.log(`History regression: ${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
