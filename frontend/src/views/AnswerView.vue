<script setup>
import AppShell from '@/components/layout/AppShell.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import NarrowColumn from '@/components/layout/NarrowColumn.vue'
import AppBadge from '@/components/common/AppBadge.vue'
import AppCard from '@/components/common/AppCard.vue'
import AppSkeleton from '@/components/common/AppSkeleton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import InlineNotice from '@/components/common/InlineNotice.vue'
import ModeSwitch from '@/components/teaching/ModeSwitch.vue'
import MyThoughtBlock from '@/components/answer/MyThoughtBlock.vue'
import AssistantBubble from '@/components/answer/AssistantBubble.vue'
import HintBar from '@/components/answer/HintBar.vue'
import ReferenceDerivationCard from '@/components/answer/ReferenceDerivationCard.vue'
import CollapsibleAnswerCard from '@/components/answer/CollapsibleAnswerCard.vue'
import ConflictAlert from '@/components/answer/ConflictAlert.vue'
import GapNotice from '@/components/answer/GapNotice.vue'
import SimilarQuestionList from '@/components/answer/SimilarQuestionList.vue'
import FollowUpBox from '@/components/answer/FollowUpBox.vue'
import PracticeRecommend from '@/components/answer/PracticeRecommend.vue'
import PracticeSwitchNotice from '@/components/answer/PracticeSwitchNotice.vue'
import PracticeQuestionBrief from '@/components/answer/PracticeQuestionBrief.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAnswerFlow } from '@/composables/useAnswerFlow'
import { useStepParser } from '@/composables/useStepParser'
import { useSessionStore } from '@/store/session'
import { useWjHistoryStore } from '@/store/wjHistory'
import { useWjPracticeStore } from '@/store/wjPractice'
import { useUiStore } from '@/store/ui'
import { PATH, ROUTE, withQuery } from '@/constants/routes'
import { DEMO_QUERY, DEMO_SUGGESTIONS, PRACTICE_SUGGESTIONS } from '@/constants/demo'
import { findCandidate } from '@/mock/fixtures/practiceCandidates'
import { formatRelativeTime } from '@/utils/format'
const session = useSessionStore()
const history = useWjHistoryStore()
const practice = useWjPracticeStore()
const ui = useUiStore()
const flow = useAnswerFlow()
const parser = useStepParser()
const route = useRoute()
const router = useRouter()
const answerExpanded = ref(false)
const query = computed(() => (typeof route.query.q === 'string' && route.query.q.trim() ? route.query.q : session.rawInput || history.current?.stem || (route.query.mock && route.query.mock !== 'auto' ? DEMO_QUERY : '')))
const modeFromRoute = computed(() => (route.query.mode === 'direct' ? 'direct' : 'guided'))
const loading = computed(() => session.status === 'loading' || session.status === 'idle')
const isError = computed(() => session.status === 'error')
const isTimeout = computed(() => session.status === 'timeout')
const isEmpty = computed(() => session.status === 'empty')
const mainReply = computed(() => session.visibleMessages.filter((m) => m.role === 'assistant').at(-1) ?? null)
const followTurns = computed(() => session.visibleMessages.filter(m => m.id !== mainReply.value?.id))
const steps = computed(() =>
  parser.stepsFor(
    session.matchType,
    mainReply.value?.content ?? '',
    session.answerCollapsed ? 'guided' : 'direct',
    session.question?.answer ?? '',
    session.result?.fromPractice && session.answerCollapsed ? null : session.question
  )
)
const segments = computed(() => parser.segmentsFor(session.question?.stem ?? '', session.question?.segments))
const hint = computed(() => steps.value[0]?.hint ?? '')
/** 把答案拆成逐条结论，折叠卡里一行一条更易核对 */
const answerLines = computed(() => {
  const raw = session.question?.answer ?? ''
  return raw
    .split(/[，,；;。]/)
    .map((s) => s.trim())
    .filter(Boolean)
})
const bubbleTag = computed(() => {
  if (session.isMiss) return '模型推断'
  return session.mode === 'guided' ? '预期提示' : '完整讲解'
})
const bubbleTone = computed(() => {
  if (session.isMiss) return 'gray'
  return session.mode === 'guided' ? 'teal' : 'blue'
})
const derivationNote = computed(() => {
  if (!segments.value.length) return ''
  const total = segments.value.reduce((n, s) => n + s.bits, 0)
  return `${total} 位地址 = ${segments.value.map((s) => `${s.label} ${s.bits} 位`).join(' + ')}`
})
const answerCardTitle = computed(() => {
  if (session.isMiss) return '模型结论'
  return session.mode === 'guided' ? '先尝试，再核对' : '参考答案'
})
const restoredLabel = computed(() => {
  if (!session.restoredFromHistory || !history.current) return ''
  return `从本地历史恢复 · ${formatRelativeTime(history.current.updatedAt)}`
})
const showSimilarNotice = computed(() => session.status === 'similar')
/** 推荐入口的演示开关：?rec=none 看无候选，?rec=error 看推荐失败 */
const recVariant = computed(() => {
  const v = route.query.rec
  return v === 'none' || v === 'error' || v === 'slow' ? v : 'auto'
})
/** 考点/章节一律取题目真实字段，不再写死 DEMO_KNOWLEDGE_POINT（TD-06） */
const knowledgePoint = computed(() =>
  session.result?.practiceMeta?.knowledgePoints?.[0] || session.question?.chapter || ''
)
const chapter = computed(() => session.question?.chapter ?? '')
const switchNoticeVisible = computed(
  () =>
    practice.noticeVisible &&
    Boolean(practice.lastSwitch) &&
    practice.lastSwitch?.to?.questionId === session.question?.questionId
)
async function syncPracticeRoute() {
  const nextQuery = { ...route.query, q: session.rawInput, sid: session.historyId, mode: session.mode }
  if (session.questionId) nextQuery.practice = session.questionId
  else delete nextQuery.practice
  await router.replace({ path: route.path, query: nextQuery })
}
async function onPracticeSelect(candidate) {
  const location = router.currentRoute.value
  if (await flow.startPractice(candidate) && router.currentRoute.value === location) {
    await syncPracticeRoute()
    if (route.name === ROUTE.answer) ui.toast('已切换到新题，旧题状态已隔离', 'info')
  }
}
async function loadPage(force = false) {
  const location = router.currentRoute.value
  ui.initScenario(route.query.mock)
  const mode = modeFromRoute.value
  const sessionId = typeof route.query.sid === 'string' ? route.query.sid : undefined
  const practiceId = typeof route.query.practice === 'string' ? route.query.practice : ''
  if (practiceId && !force) {
    if (flow.restorePractice(practiceId, { sessionId, mode })) {
      answerExpanded.value = !session.answerCollapsed
      return
    }
    const candidate = flow.inDemoMode.value ? findCandidate(practiceId) : practice.candidateById(practiceId)
    if (candidate && await flow.startPractice(candidate, { mode, recordNotice: false })) {
      if (router.currentRoute.value === location) await syncPracticeRoute()
      return
    }
    if (router.currentRoute.value !== location) return
  }
  await flow.ensure({ q: query.value, sessionId, mode, scenario: ui.scenario, allowRestore: !force, forceReload: force })
  if (router.currentRoute.value === location) answerExpanded.value = !session.answerCollapsed
}
onMounted(() => {
  history.load()
  void loadPage()
})
onBeforeUnmount(() => {
  if (practice.switching) practice.reset()
})
watch(
  () => [route.name, route.query.mock, route.query.q, route.query.sid, route.query.mode, route.query.practice],
  ([name, scenario], [, previousScenario]) => {
    if (name !== ROUTE.answer) return
    if (practice.switching) practice.reset()
    void loadPage(scenario !== previousScenario)
  }
)
watch(() => session.answerCollapsed, hidden => { answerExpanded.value = !hidden })
function changeMode(next) {
  if (session.result?.fromPractice) flow.setPracticeMode(next)
  void router.replace({ path: route.path, query: { ...route.query, mode: next } })
}
function onToggleAnswer(expanded) {
  answerExpanded.value = expanded
  if (expanded) flow.revealAnswer()
}
function goSteps() {
  void router.push(withQuery(PATH.steps, { q: query.value, sid: session.historyId, mock: ui.scenario, mode: session.mode }))
}
function goTeaching() {
  void router.push(withQuery(PATH.teaching, { q: query.value, sid: session.historyId, mock: ui.scenario, mode: session.mode }))
}
async function send(text) {
  await flow.followUp(text)
}
function fallbackToDemo() {
  const { practice: _practice, sid: _sid, ...query } = route.query
  void router.replace({ path: route.path, query: { ...query, mock: 'original' } })
  ui.toast('已切换到演示数据', 'info')
}
</script>

<template>
  <AppShell>
    <PageHeader title="问径 · 知识答疑" :subtitle="restoredLabel || '当前题目与作答保持关联'">
      <template #actions>
        <ModeSwitch :mode="session.mode" :disabled="loading || practice.switching" @change="changeMode" />
        <button
          v-if="session.status === 'success' || session.status === 'miss'"
          type="button"
          class="link-btn"
          @click="goSteps"
        >
          分步提示
        </button>
        <button
          v-if="session.status === 'success' || session.status === 'miss'"
          type="button"
          class="link-btn"
          @click="goTeaching"
        >
          完整讲解
        </button>
      </template>
    </PageHeader>

    <NarrowColumn>
      <!-- 加载态：只画骨架，不做整页 spinner -->
      <template v-if="loading">
        <AppCard variant="muted" padding="lg">
          <AppSkeleton width="64px" height="12px" />
          <div style="height: 10px" />
          <AppSkeleton width="70%" height="20px" />
        </AppCard>
        <div class="bubble-skeleton">
          <AppSkeleton width="28px" height="28px" radius="8px" />
          <div class="lines">
            <AppSkeleton width="120px" height="12px" />
            <AppSkeleton width="100%" height="14px" />
            <AppSkeleton width="96%" height="14px" />
            <AppSkeleton width="78%" height="14px" />
          </div>
        </div>
        <AppSkeleton width="100%" height="40px" radius="8px" />
        <AppCard>
          <AppSkeleton width="90px" height="14px" />
          <div style="height: 14px" />
          <AppSkeleton width="100%" height="12px" />
          <div style="height: 8px" />
          <AppSkeleton width="88%" height="12px" />
          <div style="height: 8px" />
          <AppSkeleton width="92%" height="12px" />
          <div style="height: 8px" />
          <AppSkeleton width="70%" height="12px" />
          <div style="height: 16px" />
          <AppSkeleton width="100%" height="28px" radius="8px" />
        </AppCard>
      </template>

      <!-- 异常态 -->
      <ErrorState
        v-else-if="isError || isTimeout"
        :error="session.error ?? { kind: 'unknown', code: 'UNKNOWN', message: '请求失败' }"
        :attempts="flow.retryCount.value"
        @retry="flow.retry()"
        @fallback="fallbackToDemo"
      />

      <!-- 空态 -->
      <EmptyState
        v-else-if="isEmpty"
        icon="search"
        title="这道题暂无可展示的解析"
        description="接口返回成功，但没有题干与相似题。可以换一种问法重新检索，或检查 Mock 是否返回了空结构。"
        action-text="重新检索"
        @action="loadPage(true)"
      />

      <!-- 用户原题答疑；相似候选仅供参考 -->
      <template v-else>
        <PracticeSwitchNotice
          v-if="switchNoticeVisible"
          :last-switch="practice.lastSwitch"
          @dismiss="practice.dismissNotice()"
        />
        <!-- 切题后必须能重新读到新题：用题面卡代替"当前题目"，并带上来源与核验状态 -->
        <PracticeQuestionBrief
          v-if="session.result?.fromPractice && session.question"
          :question="session.question"
          :meta="session.result.practiceMeta"
          :sample="session.result.fromMockFallback"
        />
        <MyThoughtBlock v-else :text="session.rawInput" label="当前题目" />
        <template v-if="session.isSimilar">
          <InlineNotice tone="warn" title="以下候选仅供参考">答疑围绕你输入的原题进行，不使用相似题答案替代。</InlineNotice>
          <SimilarQuestionList :items="session.similar" @select="ui.toast('候选仅供参考，答疑仍针对你的原题', 'info')" />
        </template>
        <MyThoughtBlock :text="session.myThought" label="我的思路" />

        <GapNotice v-if="session.isMiss" />

        <AssistantBubble v-if="mainReply" :content="mainReply.content" :tag="bubbleTag" :tag-tone="bubbleTone">
          <template #meta>
            <AppBadge v-if="session.result?.fromMockFallback" tone="blue">示例内容</AppBadge>
          </template>
        </AssistantBubble>

        <!-- 对话单独失败：整页不打成错误态，只降级这一块 -->
        <ErrorState
          v-else-if="session.chatStatus === 'error' || session.chatStatus === 'timeout'"
          compact
          :error="session.chatError ?? { kind: 'unknown', code: 'UNKNOWN', message: '讲解加载失败' }"
          @retry="flow.retryChat()"
        />

        <AppCard v-else-if="session.chatStatus === 'loading'" variant="muted" padding="sm">
          <div class="inline-loading">
            <span class="pulse" aria-hidden="true" />
            <span>{{ session.mode === 'guided' ? '正在生成引导提示…' : '正在生成讲解…' }}</span>
          </div>
        </AppCard>

        <HintBar v-if="hint && session.answerCollapsed" :text="hint" />

        <ConflictAlert
          v-if="flow.conflictClaims.value.length"
          :bank-answer="session.question?.answer ?? ''"
          :model-text="mainReply?.content ?? ''"
          :diffs="flow.conflictClaims.value"
        />

        <CollapsibleAnswerCard
          v-if="steps.length || answerLines.length ||
            (session.result?.fromPractice && (session.question?.solution || session.chatStatus === 'success'))"
          v-model:expanded="answerExpanded"
          :title="answerCardTitle"
          :lines="answerLines"
          :review-state="session.question?.reviewState ?? 'unverified'"
          :missing="!session.question?.answer"
          :description="
            session.result?.fromPractice || session.mode === 'guided'
              ? '参考答案默认收起，按需主动展开'
              : '当前为直接讲解模式，答案默认展开'
          "
          @toggle="onToggleAnswer"
        >
          <p v-if="session.isOriginal && session.question?.solution" class="bank-solution">{{ session.question.solution }}</p>
          <ReferenceDerivationCard
            v-if="steps.length"
            class="in-card"
            :steps="steps"
            :segments="segments"
            :note="derivationNote"
            :title="session.isMiss ? '模型推导（未经题库核验）' : '参考推导'"
            :caption="session.result?.fromMockFallback ? '演示内容' : '当前讲解'"
            :sample="session.isMiss"
          />
        </CollapsibleAnswerCard>

        <!-- 同考点推荐：切题入口，无候选/未命中都有明确说明 -->
        <PracticeRecommend
          v-if="session.status === 'success' || session.isMiss"
          :question-id="session.question?.questionId ?? ''"
          :subject="session.question?.subject ?? ''"
          :chapter="chapter"
          :knowledge-point="knowledgePoint"
          :exclude-ids="session.question?.questionId ? [session.question.questionId] : []"
          :done-ids="practice.doneIds"
          :mode="session.mode"
          :variant="recVariant"
          :open-on-mount="route.query.panel === 'practice'"
          :busy="practice.switching"
          :disabled="session.isMiss"
          disabled-reason="未命中原题，无法确定考点，因此不提供同考点题推荐；可以补充题干后重新检索"
          @select="onPracticeSelect"
        />

        <!-- 追问记录 -->
        <div v-if="followTurns.length" class="turns">
          <p class="turns-label">追问记录</p>
          <template v-for="m in followTurns" :key="m.id">
            <MyThoughtBlock v-if="m.role === 'user'" :text="m.content" label="我的追问" />
            <AssistantBubble v-else :content="m.content" :avatar="true" :tag="'继续提示'" tag-tone="gray" />
          </template>
        </div>

        <FollowUpBox
          :disabled="practice.switching || !session.canFollowUp"
          :disabled-reason="practice.switching ? '正在切题' : session.chatStatus === 'loading' ? '正在生成回复' : '当前状态不可追问'"
          :loading="session.chatStatus === 'loading'"
          :error-text="['error', 'timeout'].includes(session.chatStatus) ? (session.chatError?.message ?? '发送失败') : ''"
          :suggestions="
              session.result?.fromMockFallback
                ? session.result.fromPractice ? PRACTICE_SUGGESTIONS : DEMO_SUGGESTIONS
                : []
            "
          :placeholder="
            session.isMiss ? '可继续追问，回答将标注为模型推断' : '继续追问：为什么这样算？哪一步还不清楚？'
          "
          @send="send"
          @retry="flow.retryChat()"
        />

        <p class="foot-note">记录保存在本浏览器 · 资料切片不上传后端数据库</p>
      </template>
    </NarrowColumn>
  </AppShell>
</template>

<style scoped>
.bank-solution { white-space: pre-wrap; margin-bottom: 12px; }
.link-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: var(--wj-r-sm);
  border: 1px solid var(--wj-border);
  background: var(--wj-bg-surface);
  font-size: 12.5px;
  color: var(--wj-text-2);
}

.link-btn:hover {
  border-color: var(--wj-primary);
  color: var(--wj-primary-text);
}

.bubble-skeleton {
  display: flex;
  gap: 10px;
}

.lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inline-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--wj-text-3);
}

.pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--wj-teal);
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.turns {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 4px;
}

.turns-label {
  font-size: 12px;
  color: var(--wj-text-3);
}

.muted-text {
  font-size: 13px;
  line-height: 1.7;
  color: var(--wj-text-2);
}

/* 展开后嵌在答案卡里的推导区，去掉外层重复留白 */
.in-card {
  margin-top: 14px;
}

.foot-note {
  text-align: center;
  font-size: 11.5px;
  color: var(--wj-text-3);
}

@media (prefers-reduced-motion: reduce) {
  .pulse {
    animation: none;
  }
}
</style>
