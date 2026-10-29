<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useHistoryStore } from '../store/history'
import { useSearchStore } from '../store/search'
import { useMaterialsStore } from '../store/materials'
import { uploadFile } from '../api/upload'

/**
 * SearchView —— 输入页（郑志銮）
 * 对齐 PPT 原型「文本输入 / 上传题图」：
 *   - 文本输入 Tab：知识问题/题目、辅助定位（年份/题号）、我的理解、直接讲解/引导学习
 *   - 上传题图 Tab：选图预览 → /api/upload 识别 → 可修正 → 搜题
 * 提交后：创建本地会话（问答历史）→ POST /api/search → 跳转结果页。
 */

const router = useRouter()
const history = useHistoryStore()
const search = useSearchStore()
const materials = useMaterialsStore()

const tab = ref('text')
const subject = ref('')
const rawInput = ref('')
const year = ref('')
const questionNo = ref('')
const understanding = ref('')
const mode = ref('direct')
const formError = ref('')

// 上传题图状态
const fileInput = ref(null)
const file = ref(null)
const previewUrl = ref('')
const ocrText = ref('')
const uploading = ref(false)
const uploadError = ref('')
const uploadFailures = ref([])
const savedOcrText = ref(null)
const materialSaved = computed(() => savedOcrText.value === ocrText.value.trim())

const modes = [
  { value: 'direct', title: '直接讲解', desc: '解释概念、条件与知识联系' },
  { value: 'guided', title: '引导学习', desc: '先定位疑问，再逐步提示' }
]

const subjects = ['数据结构', '计算机组成原理', '操作系统', '计算机网络']

const chunksCount = computed(() => materials.totalChunks)
const materialsCount = computed(() => materials.items.length)

const canSubmit = computed(() => {
  const text = tab.value === 'upload' ? ocrText.value : rawInput.value
  return !uploading.value && text.trim().length > 0
})

function fillExample(kind) {
  tab.value = 'text'
  if (kind === 'exercise') {
    rawInput.value =
      '某计算机按字节编址，Cache 容量 64KB、主存块大小 64B，采用四路组相联映射，地址为 32 位。某同学说“该地址的组号占 2 位”。请判断该说法是否正确，并说明理由。'
    year.value = ''
    questionNo.value = ''
  } else {
    rawInput.value = '为什么需要 TLB？它和 Cache 命中有什么区别？'
    year.value = ''
    questionNo.value = ''
  }
}

function pickFile(evt) {
  const f = evt.target.files?.[0]
  if (!f) return
  file.value = f
  uploadError.value = ''
  uploadFailures.value = []
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = f.type.startsWith('image/') ? URL.createObjectURL(f) : ''
  ocrText.value = ''
  savedOcrText.value = null
}

async function recognize() {
  if (!file.value) return
  uploading.value = true
  uploadError.value = ''
  uploadFailures.value = []
  try {
    const res = await uploadFile(file.value)
    ocrText.value = res.extracted_text || ''
    uploadFailures.value = res.failure_details || []
    savedOcrText.value = null
  } catch (e) {
    uploadError.value = e.message
  } finally {
    uploading.value = false
  }
}

function saveRecognizedMaterial() {
  const text = ocrText.value.trim()
  if (!text || uploading.value || materialSaved.value) return
  materials.addFromUpload({
    title: file.value?.name || '识别资料',
    file_type: file.value?.type || 'text',
    extracted_text: text
  })
  savedOcrText.value = text
}

async function start() {
  formError.value = ''
  const input = tab.value === 'upload' ? ocrText.value : rawInput.value
  if (!input.trim()) {
    formError.value = tab.value === 'upload' ? '请先上传题图并完成识别，或直接输入文字' : '请输入要查询的知识问题或题目'
    return
  }
  const payload = {
    raw_input: input.trim(),
    input_type: tab.value === 'upload' ? 'image' : 'text',
    subject: subject.value,
    year: year.value.trim(),
    question_no: questionNo.value.trim(),
    user_understanding: understanding.value.trim()
  }

  // 1) 先建本地会话（问答历史），再检索
  const session = history.createSession({
    mode: mode.value,
    questionStem: payload.raw_input,
    userAnswer: understanding.value.trim()
  })

  try {
    const result = await search.runSearch(payload)
    // 2) 回填会话元信息
    const s = history.sessions.find((x) => x.session_id === session.session_id)
    if (s) {
      s.question_id = result.question_data?.question_id || null
      s.match_type = result.match_type
      history.persist()
    }
    router.push({ path: '/result' })
  } catch (e) {
    formError.value = e.message
  }
}

onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <div class="search-view">
    <div class="search-main">
      <div class="card input-card">
        <div class="tab-bar">
          <button class="tab" :class="{ active: tab === 'text' }" @click="tab = 'text'">文本输入</button>
          <button class="tab" :class="{ active: tab === 'upload' }" @click="tab = 'upload'">上传题图</button>
        </div>

        <!-- ============ 文本输入 Tab ============ -->
        <template v-if="tab === 'text'">
          <div class="field-row field-head">
            <label class="field-label">知识问题/题目</label>
            <span class="head-right">
              选择试点课程
              <select v-model="subject" class="select" disabled title="学科独立筛选暂未开放">
                <option value="">全部学科</option>
                <option v-for="s in subjects" :key="s" :value="s">{{ s }}</option>
              </select>
            </span>
          </div>
          <textarea
            v-model="rawInput"
            class="textarea textarea-lg"
            rows="4"
            placeholder="输入想弄懂的概念、知识问题或完整题目……"
          />

          <div class="field-row">
            <label class="field-label">辅助定位（选填）</label>
            <div class="locate">
              <input v-model="year" class="input input-sm" placeholder="年份" disabled title="年份题号精确定位暂未开放" maxlength="4" inputmode="numeric" />
              <input v-model="questionNo" class="input input-sm" placeholder="题号" disabled title="年份题号精确定位暂未开放" maxlength="8" />
            </div>
            <div class="quick-fill">
              <button class="link-btn" @click="fillExample('exercise')">练习示例</button>
              <span class="sep">|</span>
              <button class="link-btn" @click="fillExample('knowledge')">知识问答示例</button>
            </div>
          </div>

          <p class="field-hint">当前按题干检索，学科与年份题号筛选暂未开放。</p>
          <label class="field-label">
            我的理解
            <span class="field-hint">选填，让讲解回应你的疑问</span>
          </label>
          <textarea
            v-model="understanding"
            class="textarea"
            rows="3"
            placeholder="我已经理解了什么？哪个概念或条件还不清楚？"
          />
        </template>

        <!-- ============ 上传题图 Tab ============ -->
        <template v-else>
          <label class="field-label">上传题图 / 课件页</label>
          <div class="upload-area" @click="fileInput?.click()">
            <input ref="fileInput" type="file" class="hidden-file" accept="image/*,.pdf,.md,.txt" @change="pickFile" />
            <template v-if="previewUrl">
              <img :src="previewUrl" class="upload-preview" alt="题图预览" />
            </template>
            <template v-else>
              <div class="upload-placeholder">
                <div class="upload-icon">＋</div>
                <p>点击选择图片 / PDF，识别题目文字</p>
                <p class="upload-tip">支持裁剪后上传；识别结果可修正</p>
              </div>
            </template>
          </div>
          <div v-if="file" class="file-meta">已选择：{{ file.name }}</div>

          <div class="upload-actions">
            <button class="btn btn-primary" :disabled="!file || uploading" @click="recognize">
              {{ uploading ? '识别中…' : '上传并识别' }}
            </button>
            <span class="field-hint">请核对下方识别结果，修正后再确认保存。</span>
          </div>

          <div v-if="uploadError" class="msg-error">{{ uploadError }}</div>
          <div v-if="uploadFailures.length" class="msg-warning">
            <p class="msg-title">部分内容未能识别：</p>
            <p v-for="(f, i) in uploadFailures" :key="i" class="msg-line">{{ f }}</p>
          </div>

          <label class="field-label">识别结果 <span class="field-hint">可修正后搜题</span></label>
          <textarea v-model="ocrText" class="textarea textarea-lg" rows="6" placeholder="识别出的题目文字会显示在这里，请核对修正……" />
          <div class="upload-actions">
            <button class="btn btn-ghost" :disabled="!ocrText.trim() || uploading || materialSaved" @click="saveRecognizedMaterial">
              {{ materialSaved ? '已保存修正后的内容' : '确认保存到个人资料库' }}
            </button>
          </div>
        </template>

        <!-- ============ 模式选择 ============ -->
        <label class="field-label">学习方式</label>
        <div class="mode-row">
          <button
            v-for="m in modes"
            :key="m.value"
            class="mode-card"
            :class="{ active: mode === m.value }"
            @click="mode = m.value"
          >
            <span class="mode-title">{{ m.title }}</span>
            <span class="mode-desc">{{ m.desc }}</span>
          </button>
        </div>

        <div class="input-foot">
          <span class="foot-note">
            根据学科资料检索依据，再组织讲解
            <template v-if="materialsCount > 0"> · 已携带 {{ materialsCount }} 份个人资料（{{ chunksCount }} 块切片）</template>
          </span>
          <button class="btn btn-primary btn-lg" :disabled="!canSubmit" @click="start">开始学习</button>
        </div>
        <div v-if="formError" class="msg-error">{{ formError }}</div>
      </div>
    </div>

    <!-- ============ 右侧说明 ============ -->
    <aside class="search-side">
      <div class="card side-card">
        <div class="side-title">围绕学科知识保持关联</div>
        <div class="side-sub">学习过程，围绕知识展开</div>
        <ol class="steps">
          <li><span class="step-no">01</span><span><b>知识问题</b><i>概念、题目与适用条件</i></span></li>
          <li><span class="step-no">02</span><span><b>当前理解</b><i>保留你的思路与疑问</i></span></li>
          <li><span class="step-no">03</span><span><b>回答依据</b><i>回看相关资料与知识条目</i></span></li>
          <li><span class="step-no">04</span><span><b>学习记录</b><i>关联知识点与待复习项</i></span></li>
        </ol>
      </div>
      <div class="card side-card">
        <div class="side-sub">讲解与练习，按学习任务展开</div>
        <p class="side-para">概念问题解释联系与条件。练习任务先提示，再按需查看答案。</p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.search-view {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
  align-items: start;
}
@media (max-width: 980px) {
  .search-view {
    grid-template-columns: 1fr;
  }
  .search-side {
    position: static;
  }
}
.card {
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}
.input-card {
  padding: 20px 24px;
}
.tab-bar {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--c-border);
  margin-bottom: 18px;
}
.tab {
  background: none;
  border: none;
  font-size: 15px;
  color: var(--c-text-2);
  padding: 8px 4px;
  margin-right: 18px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab.active {
  color: var(--c-primary);
  font-weight: 600;
  border-bottom-color: var(--c-primary);
}
.field-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.field-head {
  justify-content: space-between;
}
.field-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text);
  margin: 14px 0 8px;
}
.field-label:first-child {
  margin-top: 0;
}
.field-hint {
  font-weight: 400;
  font-size: 12px;
  color: var(--c-text-3);
  margin-left: 6px;
}
.head-right {
  font-size: 13px;
  color: var(--c-text-2);
  display: flex;
  align-items: center;
  gap: 8px;
}
.select {
  border: 1px solid var(--c-border);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--c-text);
  background: var(--c-card);
  outline: none;
}
.textarea {
  width: 100%;
  border: 1px solid var(--c-border);
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.7;
  font-family: var(--font);
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.textarea:focus {
  border-color: var(--c-primary);
}
.textarea-lg {
  min-height: 96px;
}
.locate {
  display: flex;
  gap: 8px;
}
.input {
  border: 1px solid var(--c-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  outline: none;
}
.input:focus {
  border-color: var(--c-primary);
}
.input-sm {
  width: 110px;
}
.quick-fill {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.link-btn {
  background: none;
  border: none;
  color: var(--c-primary);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}
.sep {
  color: var(--c-border);
}
.upload-area {
  border: 1.5px dashed var(--c-border);
  border-radius: 10px;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  background: var(--c-bg);
}
.upload-area:hover {
  border-color: var(--c-primary);
}
.hidden-file {
  display: none;
}
.upload-preview {
  max-height: 320px;
  max-width: 100%;
  object-fit: contain;
}
.upload-placeholder {
  text-align: center;
  color: var(--c-text-3);
  padding: 30px;
}
.upload-icon {
  font-size: 34px;
  color: var(--c-primary);
  margin-bottom: 8px;
}
.upload-tip {
  font-size: 12px;
  color: var(--c-text-3);
  margin-top: 6px;
}
.file-meta {
  font-size: 12px;
  color: var(--c-text-2);
  margin-top: 8px;
}
.upload-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 14px 0 6px;
}
.checkbox {
  font-size: 13px;
  color: var(--c-text-2);
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.mode-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.mode-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: 12px 14px;
  border: 1.5px solid var(--c-border);
  border-radius: 10px;
  background: var(--c-card);
  cursor: pointer;
  transition: all 0.15s;
}
.mode-card.active {
  border-color: var(--c-primary);
  background: var(--c-primary-soft);
}
.mode-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text);
}
.mode-desc {
  font-size: 12px;
  color: var(--c-text-2);
}
.input-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 18px;
}
.foot-note {
  font-size: 12px;
  color: var(--c-text-3);
}
.btn {
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}
.btn-primary {
  background: var(--c-primary);
  color: #fff;
  padding: 9px 18px;
}
.btn-primary:hover:not(:disabled) {
  background: var(--c-primary-hover);
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-lg {
  font-size: 15px;
  font-weight: 600;
  padding: 11px 30px;
}
.msg-error {
  margin-top: 12px;
  font-size: 13px;
  color: var(--c-danger);
  background: var(--c-danger-bg);
  border: 1px solid #f3c1c1;
  border-radius: 8px;
  padding: 8px 12px;
}
.msg-warning {
  margin-top: 12px;
  font-size: 13px;
  color: var(--c-warning);
  background: var(--c-warning-bg);
  border: 1px solid #f5d9a8;
  border-radius: 8px;
  padding: 8px 12px;
}
.msg-title {
  font-weight: 600;
}
.msg-line {
  margin: 2px 0;
}
.search-side {
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: sticky;
  top: 20px;
}
.side-card {
  padding: 20px;
}
.side-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--c-text);
}
.side-sub {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text-2);
  margin: 12px 0 10px;
}
.steps {
  list-style: none;
  padding: 0;
  margin: 0;
}
.steps li {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--c-border);
}
.steps li:last-child {
  border-bottom: none;
}
.step-no {
  font-size: 15px;
  font-weight: 700;
  color: var(--c-primary);
  background: var(--c-primary-soft);
  border-radius: 8px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.steps b {
  display: block;
  font-size: 14px;
  color: var(--c-text);
}
.steps i {
  display: block;
  font-style: normal;
  font-size: 12px;
  color: var(--c-text-3);
  margin-top: 2px;
}
.side-para {
  font-size: 13px;
  color: var(--c-text-2);
  line-height: 1.8;
  margin: 0;
}
</style>
