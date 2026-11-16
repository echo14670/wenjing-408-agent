import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
// 可选浏览器检查；不加入默认 npm test，也不增加项目依赖。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href : 'playwright')
const repo = fileURLToPath(new URL('../../', import.meta.url))
const out = repo + '/docs/alpha/evidence'
const url = process.env.HISTORY_BASE_URL || 'http://127.0.0.1:5184'
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) {
  throw new Error('该脚本会重置测试浏览器的学习记录，仅允许本地隔离验收地址')
}
await fs.mkdir(out, { recursive: true })
const records = ['A', 'B'].map(id => ({ session_id: id, mode: id === 'A' ? 'guided' : 'direct',
  question_id: `H-${id}`, question_stem: `历史恢复验收${id}：说明该题的知识点和作答步骤`,
  title: `历史恢复验收${id}`, match_type: 'original', answer_revealed: id === 'A',
  answer_attempt: { user_answer: `我的作答${id}`, user_reasoning: `我的独立思路${id}` },
  messages: [{ message_id: `m-${id}`, role: 'assistant', kind: 'hint', content: `这是${id}的独立讲解`,
    citations: [`验收来源${id}`], created_at: '2026-11-15T08:00:00.000Z' }],
  result_snapshot: { matchType: 'original', empty: false, fromMockFallback: false,
    fromPractice: id === 'B', similar: [],
    question: { questionId: `H-${id}`, stem: `历史恢复验收${id}：说明该题的知识点和作答步骤`,
      options: ['A. 第一项', 'B. 第二项'], answer: 'A', solution: `参考解析${id}`,
      sourceRef: '本地UI验收自拟样本', reviewState: 'verified', steps: [], hints: [], segments: [] } },
  last_reply: { reply: `这是${id}的独立讲解`, citations: [{ text: `验收来源${id}` }], toolResult: `计算结果${id}` },
  chat_status: 'success', chat_error: null,
  created_at: '2026-11-15T08:00:00.000Z', updated_at: '2026-11-15T08:00:00.000Z' }))
const results = []
for (const [name, channel] of [['chrome', 'chrome'], ['edge', 'msedge']]) {
  const browser = await chromium.launch({ channel, headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.addInitScript(() => {
    const readAsText = FileReader.prototype.readAsText
    FileReader.prototype.readAsText = function (file, encoding) {
      if (file.name === 'slow-history.json') {
        const onload = this.onload
        this.onload = event => {
          window.completeSlowHistoryRead = () => onload.call(this, event)
        }
      }
      return readAsText.call(this, file, encoding)
    }
  })
  const checks = [], errors = []
  let chatRequests = 0
  page.on('pageerror', error => errors.push(error.message))
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    if (route.request().url().endsWith('/chat')) chatRequests++
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 'ok', questions: 81, llm_configured: false, reply: '仅为本地UI接口替身', citations: [], tool_result: '' }) })
  })
  try {
    await page.goto(url + '/#/history')
    await page.evaluate(records => localStorage.setItem('wenjing:history:v1', JSON.stringify(records)), records)
    await page.reload()
    await page.getByText('历史恢复验收A', { exact: true }).click()
    await page.getByText('我的独立思路A', { exact: false }).waitFor()
    checks.push('读取旧数据、显示独立思路')
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 JSON', exact: true }).click()
    const downloaded = await downloadPromise
    const exported = JSON.parse(await fs.readFile(await downloaded.path(), 'utf8'))
    assert.equal(exported.sessions.length, 2)
    checks.push('浏览器导出完整JSON')
    const mixed = { version: 1, sessions: [records[0], { ...records[1], session_id: 'C', title: '导入的新会话C' },
      { ...records[1], session_id: 'C' }, { session_id: 'invalid' }] }
    async function select(data, filename = 'history.json') {
      await page.locator('input[type=file]').setInputFiles({ name: filename, mimeType: 'application/json',
        buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)) })
    }
    await select(mixed)
    await page.getByText('可新增 1 条', { exact: false }).waitFor()
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('wenjing:history:v1')).length), 2)
    await page.screenshot({ path: `${out}/history-import-${name}.png`, fullPage: true })
    await page.getByRole('button', { name: '取消导入', exact: true }).click()
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('wenjing:history:v1')).length), 2)
    checks.push('预览与取消不写入')
    await select({ version: 1, sessions: [{ ...records[0], session_id: 'older-file' }] },
      'slow-history.json')
    await select(mixed)
    await page.getByText('共 4 条，可新增 1 条', { exact: false }).waitFor()
    await page.waitForFunction(() => typeof window.completeSlowHistoryRead === 'function')
    await page.evaluate(() => window.completeSlowHistoryRead())
    await page.getByText('共 4 条，可新增 1 条', { exact: false }).waitFor({ timeout: 2000 })
    checks.push('较早选择的文件读完较晚时，仍确认最新文件')
    await page.getByRole('button', { name: '确认导入', exact: true }).click()
    await page.getByText('新增 1 条，重复跳过 2 条，无效 1 条', { exact: false }).waitFor()
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('wenjing:history:v1')).length), 3)
    checks.push('批内/库内去重与实际新增计数')
    await select(mixed)
    await page.getByText('可新增 0 条', { exact: false }).waitFor()
    assert.equal(await page.getByRole('button', { name: '确认导入', exact: true }).isDisabled(), true)
    await page.getByRole('button', { name: '取消导入', exact: true }).click()
    checks.push('重复导入0新增且禁止空确认')
    await select('{broken')
    await page.getByText('不是合法的 JSON', { exact: false }).waitFor()
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('wenjing:history:v1')).length), 3)
    checks.push('损坏文件不破坏历史')
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: '清空全部', exact: true }).click()
    await select(exported)
    await page.getByRole('button', { name: '确认导入', exact: true }).click()
    await page.reload()
    const disk = await page.evaluate(() => JSON.parse(localStorage.getItem('wenjing:history:v1')))
    assert.deepEqual(disk, exported.sessions)
    checks.push('导出/清空/导入/刷新完整往返')
    for (const id of ['A', 'B', 'A']) {
      await page.goto(url + '/#/history')
      await page.getByText(`历史恢复验收${id}`, { exact: true }).click()
      const card = page.locator('.session-card').filter({ hasText: `历史恢复验收${id}` })
      await card.getByRole('button', { name: '继续答疑', exact: true }).click()
      await page.waitForURL(url => url.hash.startsWith('#/answer?'))
      await page.locator('.wj-root').waitFor()
      await page.getByText(`这是${id}的独立讲解`, { exact: true }).first().waitFor()
      assert.ok(new URL(page.url()).hash.includes(`sid=${id}`))
      await page.reload()
      await page.getByText(`这是${id}的独立讲解`, { exact: true }).first().waitFor()
      assert.ok((await page.locator('body').innerText()).includes(`我的作答${id}`))
    }
    assert.equal(chatRequests, 0)
    assert.deepEqual(errors, [])
    checks.push('A/B/A页面恢复及刷新，不重复请求模型、不串会话、无页面异常')
    results.push({ browser: name, passed: true, checks, errors, chat_requests: chatRequests })
  } catch (error) {
    await page.screenshot({ path: `${out}/history-failure-${name}.png`, fullPage: true })
    results.push({ browser: name, passed: false, checks, errors, error: error.message })
  } finally { await browser.close() }
}
const source_hashes = {}
for (const relative of ['frontend/src/utils/historyExchange.js', 'frontend/src/store/history.js',
  'frontend/src/store/wjHistory.js', 'frontend/src/views/HistoryView.vue',
  'frontend/scripts/test-history.mjs', 'frontend/scripts/test-history-browser.mjs']) {
  const source = (await fs.readFile(resolve(repo, relative), 'utf8')).replace(/\r\n/g, '\n')
  source_hashes[relative] = createHash('sha256').update(source).digest('hex')
}
await fs.writeFile(out + '/history-browser-check.json', JSON.stringify({
  executed_at: new Date().toISOString(), source_hash_format: 'UTF-8 text, LF newlines, SHA-256',
  source_hashes, base_url: url, mode: '本地开发界面，隔离浏览器上下文，API替身；非线上/真实模型验收', results }, null, 2))
console.log(JSON.stringify(results, null, 2))
if (results.some(r => !r.passed)) process.exitCode = 1
