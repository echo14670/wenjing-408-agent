<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSearchStore } from '../store/search'
import { useHistoryStore } from '../store/history'
import MatchTypeBadge from '../components/MatchTypeBadge.vue'
import AnswerPanel from '../components/AnswerPanel.vue'
import { MATCH_TYPE_META } from '../config/mock'

/**
 * ResultView —— 检索结果页（郑志銮）
 * 按 match_type 三态渲染（业务底线 #3 三态严格隔离）：
 *   - original：展示题库核验解析 + 追问（AnswerPanel）
 *   - similar ：候选题仅参考；答疑仍使用用户原始题干，不绑定候选题 ID
 *   - miss    ：未收录，进入 AI 解题分支（AnswerPanel），不虚构出处
 * 答案/步骤/教学模式展示组件由 王翔鹏 深化（见 AnswerPanel.vue 顶部注释）。
 */

const router = useRouter()
const search = useSearchStore()
const history = useHistoryStore()

onMounted(() => {
  if (!search.result) router.replace('/')
})

const result = computed(() => search.result)
const matchType = computed(() => result.value?.match_type)
const meta = computed(() => MATCH_TYPE_META[matchType.value] || null)

const q = computed(() => result.value?.question_data || null)
const sessionId = computed(() => history.currentSessionId)
const currentSession = computed(() => history.currentSession)
const answerVisible = computed(() => currentSession.value?.mode !== 'guided' || currentSession.value?.answer_revealed === true)

const modeLabel = computed(() => {
  const s = history.sessions.find((x) => x.session_id === history.currentSessionId)
  return s?.mode === 'guided' ? '引导学习' : '直接讲解'
})

const reviewLabel = { verified: '已核验', pending: '待核验', disputed: '有争议' }

function back() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}
</script>

<template>
  <div v-if="result" class="result-view">
    <div class="result-head">
      <button class="link-btn" @click="back">← 返回继续提问</button>
      <div class="head-meta">
        <span class="source-chip" :title="result.source">
          {{ result.source === 'local-demo' ? '本地演示样例' : 'Apifox Mock' }}
        </span>
        <span v-if="search.searchedAt" class="time">{{ new Date(search.searchedAt).toLocaleString('zh-CN') }}</span>
      </div>
    </div>

    <!-- 检索摘要 -->
    <div class="card query-card">
      <div class="query-line">
        <MatchTypeBadge :type="matchType" />
        <span v-if="meta" class="meta-desc">{{ meta.desc }}</span>
        <span class="spacer" />
        <span class="mode-tag">{{ modeLabel }}</span>
      </div>
      <div class="query-text">{{ search.query?.raw_input }}</div>
    </div>

    <!-- ============ 原题命中 ============ -->
    <template v-if="matchType === 'original' && q">
      <div class="card q-card">
        <div class="q-head">
          <span class="q-title">题目</span>
          <span class="q-meta">
            <span v-if="q.subject" class="tag">{{ q.subject }}</span>
            <span v-if="q.chapter" class="tag">{{ q.chapter }}</span>
            <span class="tag tag-review" :class="`review-${q.review_state}`">{{ reviewLabel[q.review_state] || q.review_state }}</span>
          </span>
        </div>
        <p class="q-stem">{{ q.stem }}</p>
        <ul v-if="Array.isArray(q.options) && q.options.length" class="q-options">
          <li v-for="opt in q.options" :key="opt">{{ opt }}</li>
        </ul>
        <div v-if="q.source_ref" class="q-source">来源：{{ q.source_ref }}</div>
      </div>

      <div v-if="answerVisible" class="card solution-card">
        <div class="solution-head">
          <span class="solution-title">题库核验解析</span>
          <span class="answer-chip">参考答案：{{ q.answer }}</span>
        </div>
        <div v-if="q.solution" class="solution-body">{{ q.solution }}</div>
        <div v-else class="solution-body solution-empty">该题暂无解析文本，可围绕答案追问。</div>
        <div class="solution-note">
          优先展示题库核验解析；模型讲解与原答案冲突时，将同屏展示差异供你核对（红线 #1）。
        </div>
      </div>

      <div v-else class="card solution-card">
        <p>引导模式下，参考答案和完整解析暂时收起。</p>
        <button class="btn btn-primary" @click="history.revealAnswer(sessionId)">查看答案</button>
      </div>

      <section class="chat-section">
        <div class="section-title">追问与讲解</div>
        <AnswerPanel v-if="sessionId" :session-id="sessionId" />
      </section>
    </template>

    <!-- ============ 相似题（仅参考） ============ -->
    <template v-else-if="matchType === 'similar'">
      <div class="card banner banner-warning">
        <div class="banner-title">相似题仅作参考展示</div>
        <p class="banner-text">
          当前题库未精确命中你的题目。相似题只用于参考知识点与解题方向，
          不会代替你的题目进入作答与追问流程。你可以返回修正题干，或在下方继续讨论自己输入的题目。
        </p>
        <div class="banner-actions">
          <button class="btn btn-primary" @click="back">返回修正题干</button>
        </div>
      </div>

      <div v-if="result.similar_questions?.length" class="similar-list">
        <div v-for="(sim, i) in result.similar_questions" :key="sim.question_id || i" class="card similar-card">
          <div class="similar-head">
            <span class="similar-index">相似 {{ i + 1 }}</span>
            <span v-if="sim.subject" class="tag">{{ sim.subject }}</span>
          </div>
          <p class="similar-stem">{{ sim.stem }}</p>
          <div v-if="sim.source_ref" class="similar-source">{{ sim.source_ref }}</div>
        </div>
      </div>
      <section class="chat-section">
        <div class="section-title">针对我输入的题目继续求解</div>
        <AnswerPanel v-if="sessionId" :session-id="sessionId" />
      </section>
    </template>

    <!-- ============ 未命中（AI 解题） ============ -->
    <template v-else-if="matchType === 'miss'">
      <div class="card banner banner-info">
        <div class="banner-title">题库未收录该题目</div>
        <p class="banner-text">
          将结合题干、你的理解与个人资料切片尝试解题。回答会标明依据来源；
          <b>不会编造真题年份、教材页码等出处</b>（红线 #2 防幻觉）。结果如需核对，请以教材与真题解析为准。
        </p>
      </div>

      <section class="chat-section">
        <div class="section-title">AI 解题与追问</div>
        <AnswerPanel v-if="sessionId" :session-id="sessionId" />
      </section>
    </template>

    <!-- ============ 未知 match_type（接口异常兜底） ============ -->
    <template v-else>
      <div class="card banner banner-danger">
        <div class="banner-title">接口返回了无法识别的 match_type</div>
        <p class="banner-text">
          当前 Mock 返回的数据不是契约规定的 original / similar / miss。
          可在右下角开关切到「本地样例」验证三态 UI，或让后端/QA 核对 Apifox 响应配置。
        </p>
      </div>
      <pre class="raw-json">{{ JSON.stringify(result, null, 2) }}</pre>
    </template>
  </div>
</template>

<style scoped>
.result-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.link-btn {
  background: none;
  border: none;
  color: var(--c-primary);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
}
.head-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.source-chip {
  font-size: 12px;
  color: var(--c-text-2);
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: 999px;
  padding: 3px 10px;
}
.time {
  font-size: 12px;
  color: var(--c-text-3);
}
.card {
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}
.query-card {
  padding: 14px 18px;
}
.query-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.meta-desc {
  font-size: 13px;
  color: var(--c-text-2);
}
.spacer {
  flex: 1;
}
.mode-tag {
  font-size: 12px;
  color: var(--c-text-2);
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: 999px;
  padding: 3px 10px;
}
.query-text {
  margin-top: 10px;
  font-size: 14px;
  color: var(--c-text);
  line-height: 1.7;
}
.q-card {
  padding: 18px 20px;
}
.q-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}
.q-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--c-text);
}
.q-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.tag {
  font-size: 12px;
  color: var(--c-text-2);
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: 999px;
  padding: 3px 10px;
}
.tag-review {
  color: var(--c-warning);
  background: var(--c-warning-bg);
  border-color: #f5d9a8;
}
.review-verified {
  color: var(--c-success);
  background: var(--c-success-bg);
  border-color: #bbe7c9;
}
.review-disputed {
  color: var(--c-danger);
  background: var(--c-danger-bg);
  border-color: #f3c1c1;
}
.q-stem {
  font-size: 14px;
  line-height: 1.8;
  color: var(--c-text);
  margin: 0 0 10px;
  white-space: pre-wrap;
}
.q-options {
  list-style: none;
  padding: 0;
  margin: 0 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.q-options li {
  font-size: 13px;
  color: var(--c-text-2);
  padding: 4px 10px;
  background: var(--c-bg);
  border-radius: 6px;
}
.q-source {
  font-size: 12px;
  color: var(--c-text-3);
  border-top: 1px dashed var(--c-border);
  padding-top: 10px;
  margin-top: 4px;
}
.solution-card {
  padding: 18px 20px;
}
.solution-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.solution-title {
  font-size: 15px;
  font-weight: 700;
}
.answer-chip {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-success);
  background: var(--c-success-bg);
  border: 1px solid #bbe7c9;
  border-radius: 999px;
  padding: 4px 12px;
}
.solution-body {
  font-size: 14px;
  line-height: 1.9;
  color: var(--c-text);
  white-space: pre-wrap;
  background: var(--c-bg);
  border-radius: 8px;
  padding: 14px 16px;
}
.solution-empty {
  color: var(--c-text-3);
}
.solution-note {
  font-size: 12px;
  color: var(--c-text-3);
  margin-top: 10px;
}
.chat-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--c-text);
}
.banner {
  padding: 18px 20px;
}
.banner-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 8px;
}
.banner-text {
  font-size: 13px;
  line-height: 1.8;
  color: var(--c-text-2);
  margin: 0;
}
.banner-actions {
  margin-top: 12px;
}
.banner-warning {
  border-left: 4px solid var(--c-warning);
  background: var(--c-warning-bg);
}
.banner-info {
  border-left: 4px solid var(--c-primary);
  background: var(--c-primary-soft);
}
.banner-danger {
  border-left: 4px solid var(--c-danger);
  background: var(--c-danger-bg);
}
.similar-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.similar-card {
  padding: 14px 18px;
}
.similar-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.similar-index {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-warning);
  background: var(--c-warning-bg);
  border: 1px solid #f5d9a8;
  border-radius: 999px;
  padding: 2px 10px;
}
.similar-stem {
  font-size: 13px;
  line-height: 1.7;
  color: var(--c-text);
  margin: 0 0 6px;
}
.similar-source {
  font-size: 12px;
  color: var(--c-text-3);
}
.raw-json {
  font-size: 12px;
  background: #0f172a;
  color: #a5f3fc;
  border-radius: 8px;
  padding: 14px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
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
.btn-primary:hover {
  background: var(--c-primary-hover);
}
</style>
