import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const baseUrl = process.env.SIMILAR_BASE_URL || 'http://127.0.0.1:5198'
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseUrl).hostname)) {
  throw new Error('相似题回归只允许连接本机测试页面')
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href
  : 'playwright')
const originalQuestion = '用户输入的原题：请解释直接映射中块号与行号的关系。'
const modelReply = '这里是原问题的第一条引导提示。'
const candidate = {
  question_id: 'SIM-TEST-1',
  subject: '计算机组成原理',
  stem: '相似候选题干摘要',
  source_ref: '本机回归样例'
}
const detail = {
  ...candidate,
  stem: '完整相似题：有八个 Cache 行，直接映射需要几位行索引？',
  options: ['A. 两位', 'B. 三位'],
  answer: 'B',
  solution: '八个 Cache 行需要三位行索引。',
  review_state: 'verified'
}

async function exercise(browser, entrance) {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(6000)
  const errors = []
  const chats = []
  let detailRequests = 0
  let detailStatus = 404
  let detailBody = { detail: '题目不存在' }
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', route => {
    switch (new URL(route.request().url()).pathname) {
      case '/api/health':
        return route.fulfill({ json: { status: 'ok', questions: 81, llm_configured: true, llm_model: 'test-model' } })
      case '/api/search':
        return route.fulfill({ json: { match_type: 'similar', question_data: null, similar_questions: [candidate] } })
      case '/api/question/' + candidate.question_id:
        detailRequests++
        return route.fulfill({ status: detailStatus, json: detailBody })
      case '/api/chat': {
        const id = route.request().postDataJSON().question_id
        chats.push(id)
        return route.fulfill({ json: { reply: id ? '先想想八是二的几次方。' : modelReply, tool_result: '', citations: [] } })
      }
      default:
        return route.fulfill({ status: 404, json: {} })
    }
  })
  const readHistory = () => page.evaluate(() => JSON.parse(localStorage.getItem('wenjing:history:v1') ?? '[]'))
  try {
    await page.goto(baseUrl)
    await page.getByPlaceholder('输入想弄懂的概念、知识问题或完整题目……').fill(originalQuestion)
    await page.getByRole('button', { name: '开始学习', exact: true }).click()
    await page.getByText(modelReply, { exact: true }).waitFor()
    const [before] = await readHistory()
    assert.equal(before.question_stem, originalQuestion)
    assert.equal(before.question_id, null)
    assert.deepEqual(chats, [null])

    if (entrance === 'result') {
      await page.getByRole('link', { name: '检索结果', exact: true }).click()
      await page.waitForURL('**/#/result*')
    }
    const startUrl = page.url()
    const button = page.getByRole('button', { name: entrance === 'answer' ? '查看' : '打开独立答疑', exact: true })
    const alert = page.getByRole('alert').filter({ hasText: '相似题详情加载失败' })
    const retry = alert.getByRole('button', { name: '重新请求' })

    await button.click()
    await alert.getByText('HTTP_404', { exact: true }).waitFor()
    assert.equal(page.url(), startUrl)
    assert.deepEqual(await readHistory(), [before])
    assert.deepEqual(chats, [null])

    detailStatus = 500
    detailBody = { detail: '详情服务暂不可用' }
    await retry.click()
    await alert.getByText('HTTP_500', { exact: true }).waitFor()
    assert.equal(page.url(), startUrl)
    assert.deepEqual(await readHistory(), [before])
    assert.deepEqual(chats, [null])

    detailStatus = 200
    detailBody = { question_id: detail.question_id, stem: detail.stem }
    await retry.click()
    await alert.getByText('QUESTION_DETAIL_INVALID', { exact: true }).waitFor()
    assert.equal(page.url(), startUrl)
    assert.deepEqual(await readHistory(), [before])
    assert.deepEqual(chats, [null])
    if (entrance === 'answer') {
      assert.equal(await page.getByRole('textbox', { name: '追问输入框' }).isEnabled(), true)
    }

    detailBody = detail
    await retry.click()
    await page.waitForURL(url => new URLSearchParams(url.hash.split('?')[1]).get('practice') === detail.question_id)
    await page.getByText(detail.stem, { exact: true }).waitFor()
    await page.getByRole('list', { name: '选项' }).getByText(detail.options[1], { exact: true }).waitFor()
    await page.waitForFunction(id => {
      const rows = JSON.parse(localStorage.getItem('wenjing:history:v1') ?? '[]')
      return rows.some(row => row.question_id === id && row.chat_status === 'success')
    }, detail.question_id)
    const [newSession, retained] = await readHistory()
    assert.equal(newSession.messages.at(-1).content, '先想想八是二的几次方。')
    assert.deepEqual(retained, before)
    assert.notEqual(newSession.session_id, before.session_id)
    assert.equal(newSession.question_id, detail.question_id)
    assert.equal(newSession.question_stem, detail.stem)
    assert.equal(detailRequests, 4)
    assert.deepEqual(chats, [null, detail.question_id])
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
}

for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true })
  try {
    for (const entrance of ['answer', 'result']) {
      await exercise(browser, entrance)
      console.log('PASS ' + channel + ' ' + entrance + ': 404 / 500 / invalid details, retry, independent session')
    }
  } finally {
    await browser.close()
  }
}
