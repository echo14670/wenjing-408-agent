<script setup>
import AppShell from '@/components/layout/AppShell.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import TwoColumnLayout from '@/components/layout/TwoColumnLayout.vue'
import AppCard from '@/components/common/AppCard.vue'
import AppSkeleton from '@/components/common/AppSkeleton.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppBadge from '@/components/common/AppBadge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import InlineNotice from '@/components/common/InlineNotice.vue'
import ModeSwitch from '@/components/teaching/ModeSwitch.vue'
import TeachingSection from '@/components/teaching/TeachingSection.vue'
import ChunkPreview from '@/components/teaching/ChunkPreview.vue'
import GapNotice from '@/components/answer/GapNotice.vue'
import SourcePanel from '@/components/aside/SourcePanel.vue'
import KnowledgePanel from '@/components/aside/KnowledgePanel.vue'
import LearningRecordPanel from '@/components/aside/LearningRecordPanel.vue'
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAnswerFlow } from '@/composables/useAnswerFlow'
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
const route = useRoute()
const router = useRouter()
const query = computed(() => (typeof route.query.q === 'string' && route.query.q.trim() ? route.query.q : DEMO_QUERY))
const loading = computed(() => session.status === 'loading' || session.status === 'idle')
const isError = computed(() => session.status === 'error' || session.status === 'timeout')
const mainReply = computed(() => session.messages.find((m) => m.role === 'assistant') ?? null)
const content = computed(() => mainReply.value?.content ?? '')
// 未命中时不给任何"出处"，避免看起来像编造了教材页码
const citations = computed(() => (session.isMiss ? [] : (session.lastReply?.citations ?? [])))
const knowledge = computed(() => (session.isOriginal || session.isMiss ? cacheCase.knowledgePoints : []))
const toolResult = computed(() => (session.isMiss ? null : (session.lastReply?.toolResult ?? null)))
const chunkSource = computed(() => {
  const first = materials.items[0]
  return first ? `${first.name} · ${session.contextChunks.length} 段命中` : ''
})
/** 教学模式固定为「直接讲解」，切到引导会回到答案页 */
function loadPage() {
  ui.initScenario(route.query.mock)
  void flow.ensure({
    q: query.value,
    thought: session.myThought || DEMO_THOUGHT,
    mode: 'direct',
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
  () => loadPage()
)
function changeMode(next) {
  if (next === 'direct') return
  session.setMode('guided')
  void router.push(withQuery(PATH.answer, { q: query.value, mock: ui.scenario, mode: 'guided' }))
}
function goAnswer() {
  void router.push(withQuery(PATH.answer, { q: query.value, mock: ui.scenario, mode: session.mode }))
}
</script>

<template>
  <AppShell>
    <PageHeader title="问径 · 教学模式" subtitle="完整讲解与依据同屏，先看懂再核对">
      <template #actions>
        <ModeSwitch mode="direct" :disabled="loading" @change="changeMode" />
        <button type="button" class="link-btn" @click="goAnswer">回到答案页</button>
      </template>
    </PageHeader>

    <TwoColumnLayout>
      <template v-if="loading">
        <AppCard>
          <AppSkeleton width="40%" height="16px" />
          <div style="height: 16px" />
          <AppSkeleton width="100%" height="13px" />
          <div style="height: 8px" />
          <AppSkeleton width="94%" height="13px" />
          <div style="height: 8px" />
          <AppSkeleton width="88%" height="13px" />
          <div style="height: 20px" />
          <AppSkeleton width="30%" height="14px" />
          <div style="height: 12px" />
          <AppSkeleton width="100%" height="13px" />
          <div style="height: 8px" />
          <AppSkeleton width="70%" height="13px" />
        </AppCard>
      </template>

      <ErrorState
        v-else-if="isError"
        :error="session.error ?? { kind: 'unknown', code: 'UNKNOWN', message: '请求失败' }"
        :attempts="flow.retryCount.value"
        @retry="flow.retry()"
      />

      <EmptyState
        v-else-if="session.status === 'empty'"
        icon="doc"
        title="暂无讲解内容"
        description="接口返回成功但没有可渲染的讲解正文。可以回到答案页重新检索。"
        action-text="回到答案页"
        @action="goAnswer"
      />

      <template v-else-if="session.isSimilar">
        <InlineNotice tone="warn" title="相似题讲解，非原题">
          相似题只作参考，不进入作答与追问流程。若要完整讲解，请先命中或补充题干重新检索。
        </InlineNotice>
        <TeachingSection :content="cacheCase.similar[0]" title="相似题题干" />
        <AppButton variant="outline" size="sm" @click="goAnswer">返回答案页</AppButton>
      </template>

      <template v-else>
        <GapNotice v-if="session.isMiss" title="未命中原题，本讲解为模型推断" />

        <div class="title-row">
          <h2 class="page-title">讲解</h2>
          <AppBadge v-if="session.result?.fromMockFallback" tone="blue">示例内容</AppBadge>
          <AppBadge v-if="session.mode === 'direct'" tone="teal">答案已展开</AppBadge>
        </div>

        <TeachingSection :content="content" />

        <div class="actions">
          <AppButton variant="outline" size="sm" @click="goAnswer">回到答案页核对</AppButton>
        </div>

        <p class="foot-note">讲解由模型生成 · 题库核验解析优先，冲突时同屏展示差异</p>
      </template>

      <template #aside>
        <template v-if="loading">
          <AppCard padding="sm"
            ><AppSkeleton width="72px" height="12px" />
            <div style="height: 10px" />
            <AppSkeleton width="100%" height="12px" />
            <div style="height: 8px" />
            <AppSkeleton width="84%" height="12px"
          /></AppCard>
          <AppCard padding="sm"
            ><AppSkeleton width="64px" height="12px" />
            <div style="height: 10px" />
            <AppSkeleton width="90%" height="12px"
          /></AppCard>
        </template>
        <template v-else>
          <SourcePanel
            :citations="citations"
            :source-ref="session.question?.sourceRef ?? null"
            :tool-result="toolResult"
            title="引用出处"
            :empty-hint="session.isMiss ? '模型推断，未引用教材。' : '暂无引用信息。'"
          />
          <KnowledgePanel v-if="knowledge.length" :points="knowledge" />
          <!-- 相似题不发送上下文，因此隐藏切片预览 -->
          <ChunkPreview v-if="!session.isSimilar" :chunks="session.contextChunks" :source-label="chunkSource" />
          <LearningRecordPanel
            :done="1"
            :total="1"
            :asks="session.messages.filter((m) => m.role === 'user').length"
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

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  font-size: 15px;
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 8px;
}

.foot-note {
  font-size: 11.5px;
  color: var(--wj-text-3);
}
</style>
