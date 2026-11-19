<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkbenchBackup from '@/components/WorkbenchBackup.vue'
import WorkbenchComposer from '@/components/WorkbenchComposer.vue'
import ModelConfigDialog from '@/components/layout/ModelConfigDialog.vue'
import { healthState, refreshHealth } from '@/api/health'
import { refreshModelProfiles, selectedModel } from '@/api/modelConfig'
import { errorText } from '@/api/errors'
import { useAnswerFlow } from '@/composables/useAnswerFlow'
import { useMaterialsStore } from '@/store/materials'
import { useSessionStore } from '@/store/session'
import { useWjHistoryStore } from '@/store/wjHistory'
import { useWjMaterialsStore } from '@/store/wjMaterials'
import { renderRich } from '@/utils/md'
import '@/styles/workbench.css'

const subjects = [
  { key: 'ds', name: '数据结构', mark: '数', topics: '线性表 · 树与图 · 排序', example: '二叉树的层序遍历是怎么做的？', search: '二叉树 层序遍历' },
  { key: 'co', name: '计算机组成原理', mark: '组', topics: '数据表示 · Cache · 指令', example: '什么是 Cache？', search: 'Cache 命中率' },
  { key: 'os', name: '操作系统', mark: '操', topics: '进程线程 · 内存 · 文件系统', example: '进程和线程有什么区别？', search: '进程调度' },
  { key: 'cn', name: '计算机网络', mark: '网', topics: '网络分层 · TCP · 路由', example: '为什么 TCP 建立连接要三次握手？', search: 'TCP 三次握手' }
]

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const flow = useAnswerFlow()
const history = useWjHistoryStore()
const materials = useWjMaterialsStore()
const materialLibrary = useMaterialsStore()
const draft = ref('')
const intent = ref('concept')
const selection = ref('')
const composer = ref(null)
const thread = ref(null)
const pageScroll = ref(null)
const fileInput = ref(null)
const importText = ref('')
const mobileNav = window.matchMedia('(max-width: 800px)')
const isMobileNav = ref(mobileNav.matches)
const navOpen = ref(false)
const navCollapsed = ref(false)
const showSubjects = ref(true)
const sourcesOpen = ref(false)
const composerOpen = ref(true)
const showModelConfig = ref(false)
const routeNotice = ref('')
const switching = ref(false)
const chatBusy = flow.isChatting
const searchBusy = flow.isLoading
const similarFailure = flow.similarFailure

const page = computed(() => ['history', 'materials'].includes(route.query.view) ? route.query.view : 'home')
const subject = computed(() => {
  if (route.query.subject) return subjects.find(item => item.key === route.query.subject)
  if (route.query.sid !== session.historyId) return
  const name = session.result?.workspaceSubject || session.question?.subject
  return subjects.find(item => item.name === name)
})
const inSession = computed(() => page.value === 'home' && session.status !== 'idle' && Boolean(session.rawInput))
const sessionIntent = computed(() => {
  if (!session.result) return intent.value
  return session.result.workspaceIntent || 'search'
})
const recent = computed(() => history.index.filter(record => record.stem && !record.result?.fromMockFallback)
  .slice().sort((a, b) => b.updatedAt - a.updatedAt))
const scopedRecent = computed(() => recent.value.filter(record =>
  !subject.value || record.result?.workspaceSubject === subject.value.name || record.result?.question?.subject === subject.value.name))
const scopeLabel = computed(() => subject.value?.name || '全部学科')
const exampleSubject = computed(() => subject.value || subjects[1])
const question = computed(() => session.question)
const questionOptions = computed(() => question.value?.options ?? [])
function choiceLetter(value) {
  const letter = value?.trim().toUpperCase() ?? ''
  return /^[A-Z]$/.test(letter) && letter.charCodeAt(0) - 65 < questionOptions.value.length ? letter : ''
}

const verifiedChoice = computed(() => question.value?.reviewState === 'verified'
  ? choiceLetter(question.value.answer) : '')
const recordedChoice = computed(() => choiceLetter(session.myThought))
const citations = computed(() => Array.from(new Set(session.lastReply?.citations?.map(item => item.text) || [])))
const slices = computed(() => session.restoredFromHistory ? [] : session.contextChunks)
const modelName = computed(() => {
  if (selectedModel.value) return selectedModel.value.model
  if (healthState.status === 'configured') return healthState.model || '模型已配置'
  if (healthState.loading) return '正在读取模型'
  if (healthState.status === 'unconfigured') return '模型待配置'
  return '模型状态未知'
})
const pageTitle = computed(() => ({ materials: '我的资料', history: '学习记录' })[page.value]
  || (inSession.value ? (sessionIntent.value === 'concept' ? '知识点问答' : '搜题与练习') : (subject.value?.name || '首页')))

function subjectKey(name) {
  return subjects.find(item => item.name === name)?.key
}

function queryFor(record) {
  const key = subjectKey(record.result?.workspaceSubject || record.result?.question?.subject)
  return { sid: record.id, ...(key && { subject: key }) }
}

function openHome(key) {
  navOpen.value = false
  if (page.value === 'home' && !route.query.sid && !route.query.q && !route.query.practice && subject.value?.key === key) {
    resetSession()
    return
  }
  return router.push({ name: 'workbench', query: key ? { subject: key } : {} })
}

async function newQuestion() {
  sourcesOpen.value = false
  await openHome(subject.value?.key)
  await nextTick()
  composer.value?.focus()
}

function openPage(view) {
  navOpen.value = false
  sourcesOpen.value = false
  void router.push({ name: 'workbench', query: { view } })
}

function openRecord(record) {
  navOpen.value = false
  void router.push({ name: 'workbench', query: queryFor(record) })
}

function removeRecord(record) {
  if (window.confirm('确定删除这条学习记录？')) history.remove(record.id)
}

function removeMaterial(item) {
  if (window.confirm('确定删除「' + item.title + '」？')) materialLibrary.removeMaterial(item.material_id)
}

async function restoreRecord(record) {
  intent.value = 'search'
  await flow.load({
    q: record.stem, sessionId: record.id, mode: record.mode, scenario: 'auto',
    workspaceIntent: 'search', workspaceSubject: subject.value?.name || ''
  })
  if (session.historyId === record.id) selection.value = recordedChoice.value
}

function resetSession() {
  flow.abort()
  session.reset()
  session.rawInput = ''
  selection.value = ''
  draft.value = ''
  composerOpen.value = true
  switching.value = false
}

watch(() => route.fullPath, (path, previousPath) => {
  if (route.name !== 'workbench') return
  const { sid, q, mode, practice } = route.query
  if (previousPath !== undefined && page.value === 'home' && typeof sid === 'string' && session.historyId === sid && session.rawInput) return
  routeNotice.value = ''
  resetSession()
  pageScroll.value?.scrollTo(0, 0)
  if (page.value !== 'home') return

  if (typeof sid === 'string' && flow.resume(sid)) {
    selection.value = recordedChoice.value
    void nextTick(() => scrollThread(false))
    return
  }
  const record = typeof sid === 'string' ? history.getSession(sid) : null
  if (record?.stem && !record.result) {
    void restoreRecord(record)
    return
  }
  if (typeof practice === 'string' && practice) {
    void openPractice({ id: practice, text: typeof q === 'string' ? q : '' }, mode === 'direct' ? 'direct' : 'guided')
      .then(opened => {
        if (!opened && route.fullPath === path) routeNotice.value = '无法打开这道题，请在题库中搜索。'
      })
    return
  }
  if (typeof q === 'string' && q.trim()) {
    void fillExample(q, 'search')
  } else if (sid) {
    routeNotice.value = '这条学习记录在当前浏览器中不可用。'
  }
}, { immediate: true })

watch(() => session.historyId, id => {
  if (!id || route.name !== 'workbench' || page.value !== 'home' || route.query.sid === id) return
  const key = subject.value?.key || subjectKey(session.question?.subject)
  const target = { name: 'workbench', query: { sid: id, ...(key && { subject: key }) } }
  if (route.query.q || route.query.practice) void router.replace(target)
  else void router.push(target)
})

function scrollThread(toEnd = true) {
  if (thread.value) thread.value.scrollTop = toEnd ? thread.value.scrollHeight : 0
}

function loadQuestion(content) {
  return flow.load({
    q: content, fresh: true, scenario: 'auto',
    mode: intent.value === 'search' ? 'guided' : 'direct',
    workspaceIntent: intent.value, workspaceSubject: subject.value?.name || ''
  })
}

function retrySearch() {
  const record = history.getSession(session.historyId)
  return record?.stem && !record.result ? restoreRecord(record) : loadQuestion(session.rawInput)
}

async function submit() {
  const content = draft.value.trim()
  if (!content || chatBusy.value || searchBusy.value || switching.value) return
  draft.value = ''
  if (inSession.value) {
    if (question.value && session.mode === 'direct') flow.revealAnswer()
    const pending = flow.followUp(content)
    await nextTick()
    scrollThread()
    await pending
    await nextTick()
    if (session.visibleMessages.at(-1)?.role === 'assistant') {
      thread.value?.querySelector('.wb-assistant:last-child')?.scrollIntoView({ block: 'nearest' })
    }
    return
  }
  routeNotice.value = ''
  const pending = loadQuestion(content)
  await nextTick()
  pageScroll.value?.scrollTo(0, 0)
  await pending
}

async function fillExample(value, nextIntent) {
  intent.value = nextIntent
  draft.value = value
  await nextTick()
  composer.value?.focus()
}

async function searchFromConcept() {
  const query = session.rawInput
  await router.push({ name: 'workbench', query: subject.value ? { subject: subject.value.key } : {} })
  await fillExample(query, 'search')
}

function displayReply(content) {
  if (sessionIntent.value !== 'concept') return renderRich(content)
  // 概念入口直接答疑，去掉后端通用的题库未命中提示。
  const explanation = content.replace(/^模型知识讲解：未命中题库，内容请结合教材核对。\s*/, '')
  return renderRich(explanation || content)
}

async function openPractice(item, mode = 'guided') {
  if (!item.id || switching.value) return false
  switching.value = true
  try {
    const opened = await flow.startPractice({ id: item.id, stem: item.text || item.id, requiresDetail: true }, {
      mode, recordNotice: false, workspaceSubject: subject.value?.name || ''
    })
    if (opened) {
      draft.value = ''
      selection.value = ''
      composerOpen.value = true
      await nextTick()
      scrollThread(false)
    }
    return opened
  } finally {
    switching.value = false
  }
}

function checkAnswer() {
  if (!selection.value) return
  session.myThought = selection.value
  flow.revealAnswer()
}

async function toggleComposer() {
  composerOpen.value = !composerOpen.value
  if (composerOpen.value) {
    await nextTick()
    composer.value?.focus()
  }
}

function navToggle() {
  if (isMobileNav.value) {
    navOpen.value = !navOpen.value
    if (navOpen.value) sourcesOpen.value = false
  } else navCollapsed.value = !navCollapsed.value
}

function toggleSources() {
  sourcesOpen.value = !sourcesOpen.value
  if (sourcesOpen.value) navOpen.value = false
}

function updateNavigation(event) {
  isMobileNav.value = event.matches
  navOpen.value = false
}

async function selectFile() {
  if (page.value !== 'materials') {
    sourcesOpen.value = false
    await router.push({ name: 'workbench', query: { view: 'materials' } })
    await nextTick()
    fileInput.value?.focus()
    return
  }
  fileInput.value?.click()
}

async function importFile(event) {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) return
  const item = await materials.importFile(file)
  importText.value = item?.extractedText || ''
}

function confirmImport() {
  if (materials.confirmImport(importText.value)) importText.value = ''
}

function onEscape(event) {
  if (event.key !== 'Escape' || showModelConfig.value) return
  navOpen.value = false
  sourcesOpen.value = false
}

onMounted(() => {
  mobileNav.addEventListener('change', updateNavigation)
  document.addEventListener('keydown', onEscape)
  void refreshHealth()
  void refreshModelProfiles()
})

onBeforeUnmount(() => {
  mobileNav.removeEventListener('change', updateNavigation)
  document.removeEventListener('keydown', onEscape)
  flow.abort()
})
</script>

<template>
  <div class="wb" :class="{ 'wb-sidebar-hidden': navCollapsed, 'wb-sources-hidden': !sourcesOpen }">
    <button v-if="navOpen || sourcesOpen" type="button" class="wb-overlay"
      :class="{ 'wb-overlay-nav': navOpen, 'wb-overlay-sources': sourcesOpen }"
      aria-label="关闭抽屉" @click="navOpen = false; sourcesOpen = false"></button>

    <aside id="wb-navigation" class="wb-sidebar" :class="{ 'wb-nav-open': navOpen }" aria-label="学习导航">
      <button type="button" class="wb-brand" @click="openHome()">
        <span class="wb-brand-mark" aria-hidden="true">问</span>
        <span><strong>问径</strong><small>408 学习工作台</small></span>
      </button>

      <button type="button" class="wb-new" @click="newQuestion">
        <span aria-hidden="true">＋</span> 新提问
      </button>

      <nav class="wb-nav">
        <button class="wb-nav-row" type="button" :class="{ 'wb-selected': page === 'home' && !subject && !inSession }"
          :aria-current="page === 'home' && !subject && !inSession ? 'page' : undefined"
          @click="openHome()"><span class="wb-i wb-i-home" aria-hidden="true"></span> 首页</button>
        <button class="wb-nav-row" type="button" :class="{ 'wb-selected': page === 'history' }"
          :aria-current="page === 'history' ? 'page' : undefined"
          @click="openPage('history')"><span class="wb-i wb-i-clock" aria-hidden="true"></span> 学习记录</button>
        <button class="wb-nav-row" type="button" :class="{ 'wb-selected': page === 'materials' }"
          :aria-current="page === 'materials' ? 'page' : undefined"
          @click="openPage('materials')"><span class="wb-i wb-i-file" aria-hidden="true"></span> 我的资料</button>
      </nav>

      <div class="wb-nav-section">
        <button type="button" class="wb-nav-heading" :aria-expanded="showSubjects" @click="showSubjects = !showSubjects">
          我的学科 <span aria-hidden="true">{{ showSubjects ? '⌄' : '›' }}</span>
        </button>
        <div v-if="showSubjects" class="wb-nav-list">
          <button v-for="item in subjects" :key="item.key" type="button" class="wb-nav-row"
            :class="{ 'wb-selected': subject?.key === item.key }" @click="openHome(item.key)">
            <span class="wb-subject-dot" :data-tone="item.key" aria-hidden="true"></span>{{ item.name }}
          </button>
        </div>
      </div>

      <div v-if="inSession && recent.length > 1" class="wb-nav-section wb-nav-recent">
        <div class="wb-nav-heading">最近学习</div>
        <button v-for="record in recent.slice(0, 3)" :key="record.id" class="wb-recent-row" type="button"
          :title="record.stem" :class="{ 'wb-selected': session.historyId === record.id }"
          @click="openRecord(record)">{{ record.stem }}</button>
      </div>
      <div class="wb-sidebar-footer">
        <button type="button" class="wb-config" aria-haspopup="dialog" @click="showModelConfig = true">
          <span class="wb-model-dot" :class="{ 'wb-connected': selectedModel || healthState.llmConfigured }" aria-hidden="true"></span>
          <span class="wb-config-label"><strong>模型配置</strong><small :title="modelName">{{ modelName }}</small></span>
        </button>
      </div>
    </aside>

    <ModelConfigDialog v-if="showModelConfig" workbench @close="showModelConfig = false" />

    <header class="wb-header">
      <div class="wb-header-left">
        <button type="button" class="wb-icon-button" aria-label="显示或收起导航" aria-controls="wb-navigation"
          :title="(isMobileNav ? navOpen : !navCollapsed) ? '收起导航' : '展开导航'"
          :aria-expanded="isMobileNav ? navOpen : !navCollapsed" @click="navToggle"><span class="wb-i wb-i-panel" aria-hidden="true"></span></button>
        <span v-if="subject && (inSession || page !== 'home')" class="wb-crumb">{{ subject.name }} <span aria-hidden="true">/</span></span>
        <span class="wb-page-title">{{ pageTitle }}</span>
      </div>
      <div class="wb-header-right">
        <span v-if="healthState.questions != null" class="wb-bank-status"><span aria-hidden="true"></span>题库 {{ healthState.questions }} 题</span>
        <button type="button" class="wb-panel-button" :aria-expanded="sourcesOpen" @click="toggleSources">
          <span class="wb-i wb-i-panel wb-i-panel-right" aria-hidden="true"></span>学习资料
        </button>
      </div>
    </header>

    <main ref="pageScroll" class="wb-main" :class="{ 'wb-main-session': inSession }">
      <section v-if="page === 'history'" class="wb-lane wb-management">
        <h1>学习记录</h1>
        <p class="wb-lead">打开一条记录，接着刚才的问题继续学习。</p>
        <ul v-if="recent.length" class="wb-records">
          <li v-for="record in recent" :key="record.id" class="wb-managed-record">
            <button type="button" class="wb-record" @click="openRecord(record)">
              <span><strong>{{ record.stem }}</strong>
                <small>{{ record.result?.workspaceIntent === 'concept' ? '问知识点' : '搜题与练习' }} · {{ new Date(record.updatedAt).toLocaleDateString('zh-CN') }}</small>
              </span>
              <span aria-hidden="true">↗</span>
            </button>
            <button type="button" class="wb-link wb-delete" :aria-label="'删除记录 ' + record.stem" @click="removeRecord(record)">删除</button>
          </li>
        </ul>
        <p v-else class="wb-empty">你在这个工作台的提问和练习会出现在这里。</p>
        <WorkbenchBackup kind="history" />
      </section>

      <section v-else-if="page === 'materials'" class="wb-lane wb-management">
        <h1>我的资料</h1>
        <p class="wb-lead">导入笔记或文字版讲义，答疑时会选取相关片段。</p>
        <div class="wb-upload">
          <span class="wb-doc-mark" aria-hidden="true"><span class="wb-i wb-i-file"></span></span>
          <div><strong>导入学习资料</strong><p>支持 TXT、Markdown 和含可选中文字的 PDF。</p></div>
          <label class="wb-secondary wb-file-button" :class="{ 'wb-disabled': materials.loading }">
            {{ materials.loading ? '正在提取' : '选取文件' }}
            <input ref="fileInput" type="file" :disabled="materials.loading" accept=".txt,.md,.pdf"
              aria-label="选取资料文件" @change="importFile">
          </label>
        </div>
        <p v-if="materials.error" class="wb-notice wb-warning" role="alert">{{ materials.error }}</p>
        <div v-if="materials.pendingImport" class="wb-import-preview">
          <h2>预览 {{ materials.pendingImport.name }}</h2>
          <p v-for="failure in materials.pendingImport.failures" :key="failure" class="wb-note">{{ failure }}</p>
          <textarea v-model="importText" aria-label="提取文本预览" rows="7"></textarea>
          <button type="button" class="wb-primary" :disabled="!importText.trim()" @click="confirmImport">确认导入</button>
        </div>
        <p v-else-if="materials.lastImport" class="wb-notice" role="status">已导入 {{ materials.lastImport.chunks }} 个片段。</p>
        <h2 class="wb-block-heading">已导入资料</h2>
        <ul v-if="materialLibrary.items.length" class="wb-records">
          <li v-for="item in materialLibrary.items" :key="item.material_id" class="wb-material-entry">
            <div class="wb-material-row">
              <span class="wb-i wb-i-file" aria-hidden="true"></span>
              <strong>{{ item.title }}</strong>
              <small>{{ item.chunks.length }} 个片段</small>
              <button type="button" class="wb-link wb-delete" :aria-label="'删除资料 ' + item.title" @click="removeMaterial(item)">删除</button>
            </div>
            <details class="wb-material-preview">
              <summary>查看正文</summary>
              <p>{{ item.extracted_text }}</p>
            </details>
          </li>
        </ul>
        <p v-else class="wb-empty">还没有导入资料。</p>
        <WorkbenchBackup kind="materials" />
      </section>

      <template v-else-if="inSession">
        <div ref="thread" class="wb-thread">
          <div class="wb-lane wb-conversation">
            <div class="wb-session-tools">
              <span class="wb-scope">{{ scopeLabel }}</span>
              <button v-if="sessionIntent === 'concept'" type="button" class="wb-link"
                :disabled="chatBusy" @click="searchFromConcept">搜相关题 <span aria-hidden="true">↗</span></button>
              <span v-else-if="session.result?.fromPractice" class="wb-note">题库练习</span>
              <span v-else-if="subject" class="wb-note">检索范围 · 全部题库</span>
            </div>
            <p class="wb-user-message">{{ session.rawInput }}</p>
            <p v-if="searchBusy" class="wb-notice" role="status">正在检索题库…</p>
            <div v-if="session.error" class="wb-notice wb-warning" role="alert">
              {{ errorText(session.error) }}
              <button type="button" class="wb-link" @click="retrySearch">重试搜索</button>
            </div>

            <section v-if="question" class="wb-question">
              <div class="wb-question-head">
                <div><span class="wb-note">{{ question.subject || '题库' }} · {{ question.questionId }}</span><h2>题库题目</h2></div>
                <span class="wb-scope">{{ question.reviewState === 'verified' ? '已核验' : '待核验' }}</span>
              </div>
              <p v-if="question.stem !== session.rawInput" class="wb-stem">{{ question.stem }}</p>
              <fieldset v-if="questionOptions.length" class="wb-options" :disabled="session.answerRevealed">
                <legend class="wb-sr">选择一个选项</legend>
                <label v-for="(option, index) in questionOptions" :key="index" :class="{ 'wb-option-selected': selection === String.fromCharCode(65 + index) }">
                  <input v-model="selection" type="radio" name="answer" :value="String.fromCharCode(65 + index)">
                  <span>{{ option }}</span>
                </label>
              </fieldset>
              <div v-if="!session.answerRevealed" class="wb-question-actions">
                <button v-if="questionOptions.length" type="button" class="wb-primary"
                  :disabled="!selection" @click="checkAnswer">提交选择</button>
                <button type="button" class="wb-secondary" @click="flow.revealAnswer()">查看参考答案</button>
              </div>
              <div v-else class="wb-solution">
                <p v-if="session.myThought">{{ recordedChoice ? '你的选择' : '你的思路' }}：{{ session.myThought }}
                  <strong v-if="verifiedChoice && recordedChoice" :class="{ 'wb-incorrect': recordedChoice !== verifiedChoice }">
                    {{ recordedChoice === verifiedChoice ? '回答正确' : '与题库答案不同' }}
                  </strong>
                </p>
                <p><b>{{ question.reviewState === 'verified' ? '题库答案' : '参考答案（待核验）' }}</b> {{ question.answer || '题库暂未提供' }}</p>
                <div v-if="question.solution" class="wb-rich" v-html="renderRich(question.solution)"></div>
              </div>
            </section>

            <section v-else-if="session.similar.length" class="wb-question">
              <div class="wb-question-head"><div><span class="wb-note">题库检索</span><h2>相似题</h2></div></div>
              <ul class="wb-result-list">
                <li v-for="(item, index) in session.similar" :key="item.id || index">
                  <button type="button" :disabled="switching || !item.id" @click="openPractice(item)">
                    <span><small v-if="item.id">{{ item.id }}</small>{{ item.text }}</span><span aria-hidden="true">↗</span>
                  </button>
                </li>
              </ul>
              <p v-if="switching" class="wb-note" role="status">正在加载题目详情…</p>
              <p v-if="similarFailure" class="wb-notice wb-warning" role="alert">{{ similarFailure.error.message }}</p>
            </section>

            <p v-else-if="session.result && sessionIntent === 'search'" class="wb-notice">
              没有找到可用题目。可以补充题干，或在下方追问相关知识点。
            </p>

            <template v-for="message in session.visibleMessages" :key="message.id">
              <p v-if="message.role === 'user'" class="wb-user-message">{{ message.content }}</p>
              <article v-else class="wb-assistant">
                <div class="wb-assistant-heading"><span class="wb-answer-mark" aria-hidden="true">问</span>
                  <strong>问径</strong><span class="wb-note">{{ message.kind === 'hint' ? '引导提示' : '模型讲解' }}</span></div>
                <div class="wb-rich" v-html="displayReply(message.content)"></div>
              </article>
            </template>
            <div v-if="chatBusy" class="wb-assistant" role="status">
              <div class="wb-assistant-heading"><span class="wb-answer-mark" aria-hidden="true">问</span>正在生成讲解…</div>
            </div>
            <div v-if="session.chatError" class="wb-notice wb-warning" role="alert">
              {{ errorText(session.chatError) }}
              <button type="button" class="wb-link" @click="flow.retryChat()">重试讲解</button>
            </div>
          </div>
        </div>

        <div class="wb-session-composer">
          <div class="wb-lane">
            <div class="wb-session-composer-top">
              <button type="button" class="wb-link" :aria-expanded="composerOpen" @click="toggleComposer">
                {{ composerOpen ? '收起输入框' : '继续提问' }}
                <span aria-hidden="true">{{ composerOpen ? '⌃' : '⌄' }}</span>
              </button>
            </div>
            <WorkbenchComposer v-if="composerOpen" ref="composer" v-model="draft" v-model:intent="intent"
              compact :busy="chatBusy" :available="session.canFollowUp && !switching"
              :placeholder="question ? '写下你的思路，或追问题目的某一步…' : '继续追问…'" @send="submit">
              <template #tools>
                <div v-if="sessionIntent === 'search'" class="wb-modes" role="group" aria-label="追问方式">
                  <button v-for="mode in ['guided', 'direct']" :key="mode" type="button"
                    :disabled="chatBusy || switching || !session.result" :aria-pressed="session.mode === mode"
                    @click="flow.setPracticeMode(mode)">{{ mode === 'guided' ? '引导学习' : '直接讲解' }}</button>
                </div>
                <span v-else class="wb-note">知识点问答</span>
              </template>
            </WorkbenchComposer>
          </div>
        </div>
      </template>

      <section v-else class="wb-lane wb-home">
        <div class="wb-home-intro">
          <div v-if="subject" class="wb-subject-scope">
            <button type="button" class="wb-link" @click="openHome()">‹ 全部学科</button>
          </div>
          <h1>{{ subject ? subject.name : '今天学什么？' }}</h1>
          <p class="wb-lead">{{ subject ? subject.topics : '先问一个知识点，或从题库里找一道题。' }}</p>
        </div>

        <p v-if="routeNotice" class="wb-notice wb-warning" role="status">{{ routeNotice }}</p>
        <WorkbenchComposer ref="composer" v-model="draft" v-model:intent="intent"
          :placeholder="intent === 'concept' ? '输入你想弄懂的问题…' : '输入题干或关键词…'"
          @send="submit" />
        <div class="wb-suggestions">
          <button v-if="intent === 'concept'" type="button" @click="fillExample(exampleSubject.example, 'concept')">
            <span aria-hidden="true">↗</span>{{ exampleSubject.example }}
          </button>
          <button v-else type="button" @click="fillExample(exampleSubject.search, 'search')">
            <span class="wb-i wb-i-search" aria-hidden="true"></span>{{ exampleSubject.search }}
          </button>
        </div>

        <section v-if="!subject" class="wb-subjects">
          <h2>我的学科</h2>
          <div class="wb-subject-grid">
            <button v-for="item in subjects" :key="item.key" type="button" class="wb-subject-card" @click="openHome(item.key)">
              <span class="wb-subject-icon" :data-tone="item.key" aria-hidden="true">{{ item.mark }}</span>
              <span class="wb-subject-detail"><strong>{{ item.name }}</strong><small>{{ item.topics }}</small></span>
              <span class="wb-subject-arrow" aria-hidden="true">↗</span>
            </button>
          </div>
        </section>

        <section v-if="scopedRecent.length" class="wb-home-recent">
          <div class="wb-section-heading"><h2>继续学习</h2>
            <button class="wb-link" type="button" @click="openPage('history')">全部记录</button>
          </div>
          <ul class="wb-records">
            <li v-for="record in scopedRecent.slice(0, 3)" :key="record.id">
              <button type="button" class="wb-record" @click="openRecord(record)">
                <strong>{{ record.stem }}</strong><span aria-hidden="true">↗</span>
              </button>
            </li>
          </ul>
        </section>
      </section>
    </main>

    <aside v-if="sourcesOpen" class="wb-sources" aria-label="学习资料">
      <div class="wb-sources-head"><h2>学习资料</h2>
        <button type="button" class="wb-icon-button" aria-label="收起学习资料" @click="sourcesOpen = false">×</button>
      </div>
      <section v-if="inSession && (question || session.similar.length)" class="wb-source-section">
        <h3>题库结果</h3>
        <dl v-if="question" class="wb-source-facts">
          <div><dt>题号</dt><dd>{{ question.questionId }}</dd></div>
          <div v-if="question.chapter"><dt>章节</dt><dd>{{ question.chapter }}</dd></div>
          <div v-if="question.sourceRef"><dt>题库来源</dt><dd>{{ question.sourceRef }}</dd></div>
        </dl>
        <p v-else class="wb-note">找到 {{ session.similar.length }} 道相似题。</p>
      </section>
      <section class="wb-source-section">
        <h3>本轮资料</h3>
        <ul v-if="inSession && citations.length" class="wb-citations">
          <li v-for="citation in citations" :key="citation">{{ citation }}</li>
        </ul>
        <details v-if="inSession && slices.length" class="wb-slices">
          <summary>查看 {{ slices.length }} 个相关片段</summary>
          <p v-for="(slice, index) in slices" :key="index">{{ slice }}</p>
        </details>
        <div v-if="!inSession || (!citations.length && !slices.length)" class="wb-source-empty">
          <span class="wb-doc-mark" aria-hidden="true"><span class="wb-i wb-i-file"></span></span>
          <strong>{{ inSession ? '暂无引用资料' : '资料引用会出现在这里' }}</strong>
          <button type="button" class="wb-secondary" @click="selectFile">导入资料</button>
        </div>
      </section>
      <section v-if="inSession && !session.answerCollapsed && session.lastReply?.toolResult" class="wb-source-section">
        <h3>计算核对</h3>
        <pre>{{ session.lastReply.toolResult }}</pre>
      </section>
    </aside>
  </div>
</template>
