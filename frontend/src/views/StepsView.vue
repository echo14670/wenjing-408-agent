<script setup>
import AppShell from '@/components/layout/AppShell.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import TwoColumnLayout from '@/components/layout/TwoColumnLayout.vue'
import AppCard from '@/components/common/AppCard.vue'
import AppSkeleton from '@/components/common/AppSkeleton.vue'
import AppBadge from '@/components/common/AppBadge.vue'
import AppButton from '@/components/common/AppButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import InlineNotice from '@/components/common/InlineNotice.vue'
import ModeSwitch from '@/components/teaching/ModeSwitch.vue'
import StepTimeline from '@/components/steps/StepTimeline.vue'
import StepNav from '@/components/steps/StepNav.vue'
import SourcePanel from '@/components/aside/SourcePanel.vue'
import KnowledgePanel from '@/components/aside/KnowledgePanel.vue'
import LearningRecordPanel from '@/components/aside/LearningRecordPanel.vue'
import SimilarQuestionList from '@/components/answer/SimilarQuestionList.vue'
import AssistantBubble from '@/components/answer/AssistantBubble.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAnswerFlow } from '@/composables/useAnswerFlow'
import { useStepParser } from '@/composables/useStepParser'
import { useSessionStore } from '@/store/session'
import { useWjHistoryStore } from '@/store/wjHistory'
import { useWjMaterialsStore } from '@/store/wjMaterials'
import { useUiStore } from '@/store/ui'
import { PATH, withQuery } from '@/constants/routes'
import { DEMO_QUERY } from '@/constants/demo'
const session = useSessionStore()
const history = useWjHistoryStore()
const materials = useWjMaterialsStore()
const ui = useUiStore()
const flow = useAnswerFlow()
const parser = useStepParser()
const route = useRoute()
const router = useRouter()
const activeIndex = ref(0)
const stuckReply = ref('')
const query = computed(() => (typeof route.query.q === 'string' && route.query.q.trim() ? route.query.q : session.rawInput || history.current?.stem || (route.query.mock && route.query.mock !== 'auto' ? DEMO_QUERY : '')))
const modeFromRoute = computed(() => (route.query.mode === 'direct' ? 'direct' : 'guided'))
const loading = computed(() => session.status === 'loading' || session.status === 'idle')
const isError = computed(() => session.status === 'error' || session.status === 'timeout')
const mainReply = computed(() => session.visibleMessages.filter((m) => m.role === 'assistant').at(-1) ?? null)
const steps = computed(() =>
  parser.stepsFor(session.matchType, mainReply.value?.content ?? '', session.answerCollapsed ? 'guided' : 'direct', session.question?.answer ?? '')
)
const citations = computed(() => session.lastReply?.citations ?? [])
const knowledge = computed(() => [])
const toolResult = computed(() => session.answerCollapsed ? null : session.lastReply?.toolResult ?? null)
const asks = computed(() => session.messages.filter((m) => m.role === 'user').length)
function loadPage() {
  ui.initScenario(route.query.mock)
  void flow.ensure({
    q: query.value,
    sessionId: typeof route.query.sid === 'string' ? route.query.sid : undefined,
    mode: modeFromRoute.value,
    scenario: ui.scenario,
    allowRestore: true
  })
}
onMounted(() => {
  history.load()
  materials.load()
  loadPage()
})
watch(
  () => [route.query.mock, route.query.q, route.query.sid, route.query.mode],
  () => {
    activeIndex.value = 0
    stuckReply.value = ''
    loadPage()
  }
)
watch(steps, () => {
  activeIndex.value = 0
})
function select(index) {
  activeIndex.value = index
}
function next() {
  activeIndex.value = Math.min(activeIndex.value + 1, steps.value.length - 1)
}
function prev() {
  activeIndex.value = Math.max(activeIndex.value - 1, 0)
}
async function stuck() {
  const step = steps.value[activeIndex.value]
  if (!step) return
  const ok = await flow.followUp(`我卡在「${step.title}」这一步了，能再细一点吗？`)
  const last = session.messages.filter((m) => m.role === 'assistant').pop()
  stuckReply.value = ok && last ? last.content : ''
}
function checkAnswer() {
  void router.push(withQuery(PATH.answer, { q: query.value, sid: session.historyId, mock: ui.scenario, mode: session.mode }))
}
function changeMode(next) {
  void router.replace({ path: route.path, query: { ...route.query, mode: next } })
}
function goTeaching() {
  void router.push(withQuery(PATH.teaching, { q: query.value, sid: session.historyId, mock: ui.scenario, mode: 'direct' }))
}
</script>

<template>
  <AppShell>
    <PageHeader title="问径 · 分步提示" subtitle="按步骤推进，逐步逼近答案">
      <template #actions>
        <ModeSwitch :mode="session.mode" :disabled="loading" @change="changeMode" />
        <button type="button" class="link-btn" @click="checkAnswer">回到答案页</button>
      </template>
    </PageHeader>

    <TwoColumnLayout>
      <!-- 加载 -->
      <template v-if="loading">
        <AppCard>
          <AppSkeleton width="120px" height="14px" />
          <div style="height: 18px" />
          <div v-for="i in 5" :key="i" class="step-skeleton">
            <AppSkeleton width="24px" height="24px" radius="50%" />
            <div class="step-lines">
              <AppSkeleton width="46%" height="14px" />
              <AppSkeleton width="86%" height="12px" />
            </div>
          </div>
        </AppCard>
      </template>

      <!-- 异常 -->
      <ErrorState
        v-else-if="isError"
        :error="session.error ?? { kind: 'unknown', code: 'UNKNOWN', message: '请求失败' }"
        :attempts="flow.retryCount.value"
        @retry="flow.retry()"
      />

      <!-- 空 -->
      <EmptyState
        v-else-if="session.status === 'empty' || (!loading && steps.length === 0 && session.chatStatus !== 'loading')"
        icon="doc"
        title="该题暂无分步提示"
        description="当前讲解没有可拆分的步骤，可回到答案页继续提问，或主动查看完整讲解。"
        action-text="试试直接讲解"
        @action="goTeaching"
      />

      <!-- 正常 -->
      <template v-else>
        <AppCard>
          <header class="card-head">
            <div>
              <h2 class="card-title">分步提示</h2>
              <p class="card-sub">
                {{
                  !session.isOriginal
                    ? '未命中原题，以下步骤由模型推断，请自行核对。'
                    : '以下为当前讲解中的步骤，请结合题库参考解析核对。'
                }}
              </p>
            </div>
            <AppBadge :tone="session.isMiss ? 'gray' : 'teal'">
              {{ session.result?.fromMockFallback ? '演示步骤' : '讲解步骤' }}
            </AppBadge>
          </header>

          <StepTimeline :steps="steps" :active-index="activeIndex" @select="select" />

          <StepNav
            :current="activeIndex"
            :total="steps.length"
            :can-check="true"
            :stuck-loading="session.chatStatus === 'loading'"
            @prev="prev"
            @next="next"
            @stuck="stuck"
            @check="checkAnswer"
          />
        </AppCard>

        <AppCard v-if="stuckReply" variant="muted">
          <p class="turns-label">针对「{{ steps[activeIndex]?.title }}」的补充提示</p>
          <AssistantBubble :content="stuckReply" tag="补充提示" tag-tone="gray" class="stuck-bubble" />
        </AppCard>

        <p class="foot-note">答案默认收起 · 引导模式下不会提前给出最终结论</p>
      </template>

      <template #aside>
        <template v-if="loading">
          <AppCard padding="sm"
            ><AppSkeleton width="80px" height="12px" />
            <div style="height: 10px" />
            <AppSkeleton width="100%" height="12px"
          /></AppCard>
          <AppCard padding="sm"
            ><AppSkeleton width="70px" height="12px" />
            <div style="height: 10px" />
            <AppSkeleton width="90%" height="12px"
          /></AppCard>
        </template>
        <template v-else>
          <SourcePanel
            :citations="citations"
            :source-ref="session.question?.sourceRef ?? null"
            :tool-result="toolResult"
            :empty-hint="session.isMiss ? '未检索到教材页码与真题出处，本次为模型推断。' : '暂无引用信息。'"
          />
          <KnowledgePanel v-if="knowledge.length" :points="knowledge" />
          <LearningRecordPanel
            :done="activeIndex"
            :total="steps.length"
            :asks="asks"
            :tokens="session.chunkTokens"
            :latency-ms="session.result?.latencyMs ?? 0"
          />
        </template>
      </template>
    </TwoColumnLayout>
  </AppShell>
</template>

<style scoped>
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

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
}

.card-sub {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--wj-text-3);
}

.step-skeleton {
  display: flex;
  gap: 12px;
  padding: 10px 0;
}

.step-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.turns-label {
  font-size: 12px;
  color: var(--wj-text-3);
  margin-bottom: 10px;
}

.stuck-bubble {
  margin-top: 2px;
}

.foot-note {
  font-size: 11.5px;
  color: var(--wj-text-3);
}
</style>
