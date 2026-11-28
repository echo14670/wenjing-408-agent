<script setup>
/**
 * 三题小测面板（Beta §08 · 王翔鹏）。
 *
 * 职责边界：
 *   - 出卷、判分都走真实接口；前端不算分、不保存标准答案；
 *   - 本机只存 attempt_id / 题组版本 / 所选项 / 判分结果；
 *   - 刷新续答、重做、旧成绩查看都按 attempt_id 还原；
 *   - 页面外壳与入口由黄俊凡接工作台，本组件只接受 props 并回传 attempt 变化。
 */
import AppBadge from '@/components/common/AppBadge.vue'
import { computed, ref, watch } from 'vue'
import { fetchQuiz, submitQuiz } from '@/api/quiz'
import { useWjQuizStore } from '@/store/wjQuiz'
import { errorText } from '@/api/errors'
import { renderRich } from '@/utils/md'
import {
  ATTEMPT_STATUS,
  missingQuestions,
  optionLetters,
  resultLabel
} from '@/utils/quiz'

const props = defineProps({
  quizId: { type: String, default: 'co-memory-01' },
  /** 从学习记录或 URL 传入：打开原草稿或固定成绩 */
  attemptId: { type: String, default: '' },
  /** 嵌入工作台时不需要外层大标题 */
  embedded: { type: Boolean, default: false }
})
const emit = defineEmits(['attempt-change', 'submitted'])

const quizStore = useWjQuizStore()
const quiz = ref(null)
const attempt = ref(null)
const phase = ref('loading') // loading | answering | submitting | result | error
const loadError = ref(null)
const submitError = ref(null)
const missingHint = ref('')
let requestSeq = 0

const questions = computed(() => quiz.value?.questions ?? [])
const answers = computed(() => attempt.value?.answers ?? {})
const answeredCount = computed(() => questions.value.filter(q => answers.value[q.questionId]).length)
const isSubmitted = computed(() => attempt.value?.status === ATTEMPT_STATUS.submitted)
const result = computed(() => attempt.value?.result ?? null)
const canSubmit = computed(() => phase.value === 'answering' && answeredCount.value === questions.value.length)

async function init() {
  const seq = ++requestSeq
  phase.value = 'loading'
  loadError.value = null
  submitError.value = null
  missingHint.value = ''
  try {
    const loaded = await fetchQuiz(props.quizId)
    if (seq !== requestSeq) return
    quiz.value = loaded

    const wanted = props.attemptId ? quizStore.getAttempt(props.attemptId) : null
    // 指定 ID 不存在时不静默新建，避免学习记录点开变成另一份作答
    if (props.attemptId && !wanted) {
      loadError.value = {
        message: '这条作答记录在当前浏览器中不可用',
        detail: '换一台设备或清理过浏览器数据后，本机草稿与成绩无法找回。可以重新做一套。'
      }
      phase.value = 'error'
      return
    }
    if (wanted && wanted.quizId !== props.quizId) {
      loadError.value = { message: '这条作答属于另一套题组', detail: '请从对应的题组入口打开。' }
      phase.value = 'error'
      return
    }
    attempt.value = wanted ?? quizStore.createAttempt({
      quizId: loaded.quizId,
      version: loaded.version,
      title: loaded.title,
      questionCount: loaded.questions.length
    })
    quizStore.setCurrent(attempt.value.attemptId)
    emit('attempt-change', attempt.value.attemptId)
    phase.value = isSubmitted.value ? 'result' : 'answering'
  } catch (err) {
    if (seq !== requestSeq) return
    loadError.value = err
    phase.value = 'error'
  }
}

function choose(questionId, letter) {
  if (phase.value !== 'answering' || !attempt.value) return
  if (quizStore.saveAnswer(attempt.value.attemptId, questionId, letter)) {
    // store 是同一对象引用，重新取一次让模板确认
    attempt.value = quizStore.getAttempt(attempt.value.attemptId)
    missingHint.value = ''
  }
}

async function submit() {
  if (!canSubmit.value || !attempt.value || !quiz.value) return
  const missing = missingQuestions(questions.value, answers.value)
  if (missing.length) {
    missingHint.value = `还有 ${missing.length} 题未作答：${missing.join('、')}`
    return
  }
  const seq = ++requestSeq
  const current = attempt.value
  phase.value = 'submitting'
  submitError.value = null
  missingHint.value = ''
  try {
    const result = await submitQuiz(props.quizId, quiz.value, current.attemptId, current.answers)
    if (seq !== requestSeq) return
    quizStore.markSubmitted(current.attemptId, result, questions.value)
    attempt.value = quizStore.getAttempt(current.attemptId)
    phase.value = 'result'
    emit('submitted', { attemptId: current.attemptId, score: result.score, total: result.total })
  } catch (err) {
    if (seq !== requestSeq) return
    // 失败后保留选项，重试仍用同一个 attempt_id；后端不会记第二条答卷
    submitError.value = err
    phase.value = 'answering'
  }
}

function redo() {
  if (!quiz.value) return
  attempt.value = quizStore.createAttempt({
    quizId: quiz.value.quizId,
    version: quiz.value.version,
    title: quiz.value.title,
    questionCount: quiz.value.questions.length
  })
  quizStore.setCurrent(attempt.value.attemptId)
  submitError.value = null
  missingHint.value = ''
  phase.value = 'answering'
  emit('attempt-change', attempt.value.attemptId)
}

function openAttempt(id) {
  if (!id) return
  emit('attempt-change', id)
  void init()
}

watch(() => [props.quizId, props.attemptId], () => { void init() })
init()
</script>

<template>
  <section class="quiz" :class="{ 'quiz-embedded': embedded }">
    <header v-if="!embedded" class="quiz-head">
      <div>
        <span class="wb-note">三题小测 · {{ quiz?.quizId || quizId }}</span>
        <h1>{{ quiz?.title || '固定题组小测' }}</h1>
      </div>
      <AppBadge v-if="attempt" :tone="isSubmitted ? 'teal' : 'blue'">
        {{ isSubmitted ? '已交卷' : '未交卷' }}
      </AppBadge>
    </header>

    <p v-if="phase === 'loading'" class="wb-notice" role="status">正在读取题组…</p>

    <div v-else-if="phase === 'error'" class="wb-notice wb-warning" role="alert">
      {{ loadError?.message || '题组加载失败' }}
      <span v-if="loadError?.detail"> · {{ loadError.detail }}</span>
      <button type="button" class="wb-link" @click="init">重试</button>
      <button v-if="loadError?.message?.includes('不可用')" type="button" class="wb-link" @click="emit('attempt-change', '')">开始新作答</button>
    </div>

    <template v-else-if="quiz">
      <div class="quiz-progress" role="status">
        <span>作答进度</span>
        <strong>{{ answeredCount }} / {{ questions.length }}</strong>
        <span v-if="attempt" class="quiz-attempt">作答 ID · {{ attempt.attemptId }}</span>
      </div>

      <ol class="quiz-list">
        <li v-for="(item, index) in questions" :key="item.questionId" class="wb-question">
          <div class="wb-question-head">
            <div>
              <span class="wb-note">第 {{ index + 1 }} 题 · {{ item.questionId }}</span>
              <h2 class="wb-stem">{{ item.stem }}</h2>
            </div>
            <AppBadge v-if="result" :tone="result.results.find(r => r.questionId === item.questionId)?.isCorrect ? 'teal' : 'amber'">
              {{ resultLabel(result.results.find(r => r.questionId === item.questionId)) }}
            </AppBadge>
          </div>

          <p v-if="item.sourceRef" class="quiz-source">来源 · {{ item.sourceRef }}</p>

          <fieldset class="wb-options" :disabled="phase !== 'answering'">
            <legend class="wb-sr">为第 {{ index + 1 }} 题选择一个选项</legend>
            <label
              v-for="letter in optionLetters(item.options)"
              :key="letter"
              :class="{ 'wb-option-selected': answers[item.questionId] === letter }"
            >
              <input
                type="radio"
                :name="`quiz-${attempt?.attemptId}-${item.questionId}`"
                :value="letter"
                :checked="answers[item.questionId] === letter"
                @change="choose(item.questionId, letter)"
              >
              <span>{{ item.options[letter.charCodeAt(0) - 65] }}</span>
            </label>
          </fieldset>

          <div v-if="result" class="wb-solution">
            <p>
              <strong :class="{ 'wb-incorrect': !result.results.find(r => r.questionId === item.questionId)?.isCorrect }">
                {{ resultLabel(result.results.find(r => r.questionId === item.questionId)) }}
              </strong>
              你的选择：{{ result.results.find(r => r.questionId === item.questionId)?.selected || '未作答' }}
              · 正确选项：{{ result.results.find(r => r.questionId === item.questionId)?.correct }}
            </p>
            <div v-if="result.results.find(r => r.questionId === item.questionId)?.solution" class="wb-rich"
              v-html="renderRich(result.results.find(r => r.questionId === item.questionId).solution)"></div>
          </div>
        </li>
      </ol>

      <p v-if="missingHint" class="wb-notice wb-warning" role="alert">{{ missingHint }}</p>
      <div v-if="submitError" class="wb-notice wb-warning" role="alert">
        交卷失败：{{ errorText(submitError) }} · 选项已保留，可重试。
      </div>

      <div class="quiz-actions">
        <template v-if="phase === 'answering' || phase === 'submitting'">
          <button type="button" class="wb-primary" :disabled="!canSubmit || phase === 'submitting'" @click="submit">
            {{ phase === 'submitting' ? '正在交卷…' : '交卷' }}
          </button>
          <span v-if="!canSubmit" class="quiz-tip">选完全部题目后交卷</span>
        </template>
        <template v-else-if="phase === 'result'">
          <div class="quiz-score" role="status">
            本次得分 <strong>{{ result?.score }} / {{ result?.total }}</strong>
            <span v-if="attempt?.version">· 题组版本 {{ attempt.version }}</span>
          </div>
          <button type="button" class="wb-primary" @click="redo">重做一套</button>
        </template>
      </div>
    </template>
  </section>
</template>

<style scoped>
.quiz { max-width: 860px; }
.quiz-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.quiz-head h1 { margin: 4px 0 0; font-size: 22px; }
.quiz-progress { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: 13px; color: var(--wb-muted); }
.quiz-progress strong { color: var(--wb-text); font-size: 14px; }
.quiz-attempt { margin-left: auto; font-family: var(--wb-font-mono, monospace); font-size: 11px; }
.quiz-list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.quiz-list .wb-question-head h2 { margin: 4px 0 0; font-size: 15px; font-weight: 500; }
.quiz-source { margin: 0; font-size: 12px; color: var(--wb-muted); overflow-wrap: anywhere; }
.quiz-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
.quiz-tip { font-size: 12px; color: var(--wb-muted); }
.quiz-score { font-size: 14px; }
.quiz-score strong { font-size: 19px; color: var(--wb-accent); }
@media (max-width: 420px) {
  .quiz-attempt { width: 100%; margin-left: 0; }
  .quiz-actions .wb-primary { width: 100%; }
}
</style>
