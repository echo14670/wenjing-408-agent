<script setup>
/**
 * 答案页的「再练一道同考点题」入口。
 *
 * 入口默认收起：它不该抢走"看解析"的主视线；展开后才发推荐请求，避免每次进页面都多打一次接口。
 * 展示三件事：题目摘要、来源、核验状态 —— 缺一不可，核验状态决定用户该不该信这道题的答案。
 */
import AppBadge from '@/components/common/AppBadge.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppSkeleton from '@/components/common/AppSkeleton.vue'
import { reviewMeta, summarizeStem, emptyCandidateHint, scopeMeta, recommendScopeLine } from '@/utils/practice'
import { usePracticeList } from '@/composables/usePracticeList'
import { computed, onMounted, ref, watch } from 'vue'
const props = defineProps({
  questionId: { type: String, default: '' },
  subject: { type: String, default: '' },
  chapter: { type: String, default: '' },
  knowledgePoint: { type: String, default: '' },
  excludeIds: { type: Array, default: () => [] },
  /** 本地已做过的题号，透传给后端 done_question_ids */
  doneIds: { type: Array, default: () => [] },
  mode: { type: String, default: 'guided' },
  variant: { type: String, default: 'auto' },
  busy: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  disabledReason: { type: String, default: '' },
  /** 验收用：?panel=practice 直接展开，省得每次手点（与 ?mock= 的思路一致） */
  openOnMount: { type: Boolean, default: false }
})
const emit = defineEmits(['select'])
/** 解构成顶层 ref，模板里才会自动解包（嵌套在普通对象里不会） */
const {
  status,
  candidates,
  error,
  note,
  demo,
  scope,
  notice,
  knowledgePoint,
  loading,
  isEmpty,
  isError,
  load,
  retry: retryList,
  reset
} = usePracticeList()
const open = ref(props.openOnMount)
const modeLabel = computed(() => (props.mode === 'direct' ? '直接讲解' : '引导模式'))
const kpLabel = computed(() => knowledgePoint.value || props.knowledgePoint)
const scopeInfo = computed(() => scopeMeta(scope.value))
const scopeLine = computed(() => recommendScopeLine(scope.value, kpLabel.value, props.chapter))
const emptyHint = computed(() => emptyCandidateHint(kpLabel.value, false, scope.value))
const excludedCount = computed(() => new Set([...(props.doneIds ?? []), ...(props.excludeIds ?? [])].filter(Boolean)).size)
function ctx() {
  return {
    questionId: props.questionId,
    chapter: props.chapter,
    subject: props.subject,
    knowledgePoint: props.knowledgePoint,
    // 前端排除「当前题 + 已做题」双保险；done_question_ids 只报已做题，
    // 当前题由 question_id 负责排除，不混进「做过」的语义里。
    excludeIds: [props.questionId, ...(props.excludeIds ?? []), ...(props.doneIds ?? [])].filter(Boolean),
    doneQuestionIds: [...(props.doneIds ?? [])].filter(Boolean),
    variant: props.variant,
    limit: 3
  }
}
function ensureLoaded() {
  if (status.value === 'idle' && props.questionId) void load(ctx())
}
function toggle() {
  if (props.disabled || props.busy) return
  open.value = !open.value
  if (open.value) ensureLoaded()
}
function reload() {
  reset()
  if (open.value && props.questionId) void load(ctx())
}
function retry() {
  retryList()
}
function choose(item) {
  if (props.busy || !item) return
  emit('select', { ...item, scope: scope.value })
}
/* 换题后旧候选必须失效：否则新题下会看到上一道题的推荐 */
watch(
  () => props.questionId,
  () => {
    reset()
    if (open.value) ensureLoaded()
  }
)
onMounted(() => {
  if (open.value) ensureLoaded()
})
</script>

<template>
  <section class="practice" :class="{ open, disabled }">
    <header class="entry">
      <span class="glyph" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M4 12a8 8 0 0 1 13.7-5.6L20 8.6M20 12a8 8 0 0 1-13.7 5.6L4 15.4"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M20 4.5v4.1h-4.1M4 19.5v-4.1h4.1"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>

      <div class="entry-main">
        <h2 class="title">
          再练一道同考点题
          <AppBadge v-if="status === 'ready'" tone="blue">{{ candidates.length }} 道可选</AppBadge>
        </h2>
        <p v-if="disabled" class="sub disabled-text">{{ disabledReason }}</p>
        <p v-else class="sub">
          切题后保留「{{ modeLabel }}」，旧题的上下文、作答、揭示状态与工具结果都不会带过来
        </p>
      </div>

      <AppButton
        v-if="!disabled"
        size="sm"
        :variant="open ? 'outline' : 'primary'"
        :disabled="busy"
        @click="toggle"
      >
        {{ open ? '收起' : '再练一道' }}
      </AppButton>
    </header>

    <div v-if="open && !disabled" class="panel">
      <div class="panel-head">
        <p class="kp-line">{{ scopeLine }}</p>
        <span class="head-right">
          <AppBadge v-if="demo" tone="blue">示例数据</AppBadge>
          <AppBadge v-if="scopeInfo" :tone="scopeInfo.tone">{{ scopeInfo.label }}</AppBadge>
          <AppBadge v-else tone="gray">非原题</AppBadge>
        </span>
      </div>

      <!-- 召回层级与后端提示如实呈现：不再把 chapter / 待核验兜底写成「同考点」 -->
      <p v-if="scopeInfo && scope !== 'knowledge_point'" class="scope-hint">{{ scopeInfo.hint }}</p>
      <p v-if="notice" class="scope-notice">{{ notice }}</p>

      <!-- 加载态：只占列表高度，不整块 spinner -->
      <div v-if="loading" class="rows" aria-busy="true">
        <div v-for="i in 2" :key="i" class="row-skeleton">
          <AppSkeleton width="22px" height="22px" radius="6px" />
          <div class="sk-lines">
            <AppSkeleton width="88%" height="13px" />
            <AppSkeleton width="46%" height="11px" />
          </div>
          <AppSkeleton width="64px" height="26px" radius="7px" />
        </div>
      </div>

      <!-- 错误态：可重试，不把整页打成错误 -->
      <div v-else-if="isError" class="state">
        <p class="state-title">推荐加载失败</p>
        <p class="state-desc">
          {{ error?.message ?? '请求失败' }}{{ error?.detail ? ' · ' + error.detail : '' }}
          · 不影响当前题目的解析与追问。
        </p>
        <AppButton size="sm" variant="outline" @click="retry">重新获取</AppButton>
      </div>

      <!-- 空态：真实空结果保持空，说明原因，不拿示例数据填充 -->
      <div v-else-if="isEmpty" class="state">
        <p class="state-title">本题暂无可推荐的题目</p>
        <p class="state-desc">{{ emptyHint }}{{ note ? '（' + note + '）' : '' }}</p>
        <div class="state-actions">
          <AppButton size="sm" variant="outline" @click="reload">重新获取</AppButton>
        </div>
      </div>

      <ul v-else-if="status === 'ready'" class="list">
        <li v-for="(item, i) in candidates" :key="item.id ?? i" class="item">
          <span class="idx">{{ i + 1 }}</span>
          <div class="body">
            <p class="stem">{{ summarizeStem(item.stem) }}</p>
            <p class="meta">
              <span class="src" :title="item.sourceRef ?? '题库未标注来源'">
                来源 · {{ item.sourceRef || '题库未标注来源' }}
              </span>
              <template v-if="item.knowledgePoints?.length">
                <span class="dot">·</span>
                <span>{{ item.knowledgePoints.slice(0, 2).join(' / ') }}</span>
              </template>
              <template v-if="item.difficulty">
                <span class="dot">·</span>
                <span>难度 {{ item.difficulty }}/5</span>
              </template>
            </p>
            <p v-if="item.reason" class="reason">{{ item.reason }}</p>
          </div>
          <div class="side">
            <AppBadge :tone="reviewMeta(item.reviewState).tone">{{ reviewMeta(item.reviewState).label }}</AppBadge>
            <AppButton size="sm" variant="outline" :disabled="busy" @click="choose(item)">
              {{ busy ? '切换中…' : '开始练习' }}
            </AppButton>
          </div>
        </li>
      </ul>

      <p class="foot">
        {{ scopeLine }} · 已核验题优先；<span class="foot-strong">待核验题不展示题库答案</span>，只给模型讲解。
        <template v-if="excludedCount">已排除 {{ excludedCount }} 道当前或做过的题。</template>
      </p>
    </div>
  </section>
</template>

<style scoped>
.practice {
  border-radius: var(--wj-r-md);
  border: 1px solid var(--wj-border);
  background: var(--wj-bg-surface);
  box-shadow: var(--wj-shadow-1);
  transition: border-color var(--wj-dur) var(--wj-ease);
}

.practice.open {
  border-color: #cdd9f6;
}

.entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
}

.glyph {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 10px;
  background: var(--wj-bg-accent);
  color: var(--wj-primary);
}

.entry-main {
  flex: 1;
  min-width: 0;
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--wj-text);
}

.sub {
  margin-top: 3px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--wj-text-3);
}

.disabled-text {
  color: var(--wj-text-3);
}

.panel {
  padding: 12px 18px 16px;
  border-top: 1px solid var(--wj-divider);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.kp-line {
  font-size: 12.5px;
  color: var(--wj-text-3);
}

.scope-hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--wj-text-3);
}

.scope-notice {
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: var(--wj-r-sm);
  border: 1px solid #f0dcaa;
  background: #fff8e8;
  font-size: 12px;
  line-height: 1.6;
  color: #8a6414;
}

.kp {
  color: var(--wj-primary-text);
  font-weight: 500;
}

.head-right {
  display: flex;
  gap: 6px;
}

.list {
  display: flex;
  flex-direction: column;
  margin-top: 4px;
}

.item {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 13px 0;
}

.item + .item {
  border-top: 1px solid var(--wj-divider);
}

.idx {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--wj-bg-chip);
  color: var(--wj-text-2);
  font-size: 11.5px;
  font-family: var(--wj-font-mono);
}

.stem {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--wj-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--wj-text-3);
}

.src {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  color: var(--wj-border-strong);
}

.reason {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--wj-text-3);
}

.side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex: none;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 18px 4px 10px;
}

.state-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--wj-text);
}

.state-desc {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--wj-text-3);
  max-width: 46em;
}

.state-actions {
  margin-top: 4px;
}

.rows {
  display: flex;
  flex-direction: column;
}

.row-skeleton {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 64px;
  gap: 12px;
  align-items: center;
  padding: 13px 0;
}

.sk-lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.foot {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--wj-divider);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--wj-text-3);
}

.foot-strong {
  color: var(--wj-text-2);
}

@media (max-width: 720px) {
  .entry {
    align-items: flex-start;
  }

  .item {
    grid-template-columns: 22px minmax(0, 1fr);
  }

  .side {
    grid-column: 2;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
  }
}
</style>
