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
import { DEMO_QUERY, DEMO_THOUGHT } from '@/constants/demo'
import { cacheCase } from '@/mock/fixtures/cacheCase'
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
const query = computed(() => (typeof route.query.q === 'string' && route.query.q.trim() ? route.query.q : DEMO_QUERY))
const modeFromRoute = computed(() => (route.query.mode === 'direct' ? 'direct' : 'guided'))
const loading = computed(() => session.status === 'loading' || session.status === 'idle')
const isError = computed(() => session.status === 'error' || session.status === 'timeout')
const mainReply = computed(() => session.messages.find((m) => m.role === 'assistant') ?? null)
const steps = computed(() =>
  parser.stepsFor(session.matchType, mainReply.value?.content ?? '', session.mode, session.question?.answer ?? '')
)
const citations = computed(() => {
  // 未命中时不得展示任何"出处"，避免看起来像编造了教材页码
  if (session.isMiss) return []
  const fromReply = session.lastReply?.citations ?? []
  if (fromReply.length) return fromReply
  return session.isOriginal ? cacheCase.citations.map((text) => ({ text, sample: true })) : []
})
const knowledge = computed(() => (session.isOriginal ? cacheCase.knowledgePoints : []))
const toolResult = computed(() => (session.isMiss ? null : (session.lastReply?.toolResult ?? null)))
const asks = computed(() => session.messages.filter((m) => m.role === 'user').length)
function loadPage() {
  ui.initScenario(route.query.mock)
  void flow.ensure({
    q: query.value,
    thought: session.myThought || DEMO_THOUGHT,
    mode: modeFromRoute.value,
    scenario: ui.scenario,
    allowRestore: true
  })
}
onMounted(() => {
  history.load()
  materials.load()
  if (!session.myThought) session.myThought = DEMO_THOUGHT
  loadPage()
})
watch(
  () => route.query.mock,
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
  void router.push(withQuery(PATH.answer, { q: query.value, mock: ui.scenario, mode: session.mode }))
}
function changeMode(next) {
  session.setMode(next)
  void router.replace({ path: route.path, query: { ...route.query, mode: next } })
  void flow.load({ q: query.value, thought: session.myThought, mode: next, scenario: ui.scenario, forceReload: true })
}
function goTeaching() {
  void router.push(withQuery(PATH.teaching, { q: query.value, mock: ui.scenario, mode: 'direct' }))
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

      <!-- 相似题 -->
      <template v-else-if="session.isSimilar">
        <InlineNotice tone="warn" title="相似题不提供分步解析">
          按项目规则，相似题只作参考展示，不进入作答与追问流程，因此这里不渲染任何推导步骤。
        </InlineNotice>
        <SimilarQuestionList :items="session.similar" @select="ui.toast('相似题不支持直接作答', 'warn')" />
        <AppButton variant="outline" size="sm" @click="checkAnswer">返回答案页</AppButton>
      </template>

      <!-- 空 -->
      <EmptyState
        v-else-if="session.status === 'empty'"
        icon="doc"
        title="该题暂无分步提示"
        description="接口没有返回可用的推导结构。可以先看完整讲解，里面有同样的分步内容。"
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
                  session.isMiss
                    ? '未命中原题，以下步骤由模型推断，请自行核对。'
                    : '步骤来自题库核验解析，答案需你主动核对。'
                }}
              </p>
            </div>
            <AppBadge :tone="session.isMiss ? 'gray' : 'teal'">
              {{ session.isMiss ? '模型分步推断' : '原题解析' }}
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
