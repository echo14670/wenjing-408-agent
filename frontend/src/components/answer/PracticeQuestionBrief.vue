<script setup>
/**
 * 同考点练习题面卡。
 *
 * 答案页原本不展示题干（默认从提问页带过来的），但切题之后用户必须能重新读到新题，
 * 否则"再练一道"就变成了"换了一道看不见的题"。所以练习态下补这一块：
 * 题干 + 来源 + 核验状态，三样都摆出来，且明确标注这是同考点练习而非原题检索结果。
 */
import AppBadge from '@/components/common/AppBadge.vue'
import { reviewMeta } from '@/utils/practice'
import { computed } from 'vue'
const props = defineProps({
  question: { type: Object, required: true },
  meta: { type: Object, default: () => ({}) },
  sample: { type: Boolean, default: false }
})
const review = computed(() => reviewMeta(props.question?.reviewState))
const kps = computed(() => (props.meta?.knowledgePoints ?? []).slice(0, 3))
</script>

<template>
  <section class="brief">
    <header class="head">
      <AppBadge tone="blue">同考点练习</AppBadge>
      <span class="divider" aria-hidden="true" />
      <span class="source" :title="question.sourceRef ?? ''">来源 · {{ question.sourceRef || '题库未标注来源' }}</span>
      <span class="spacer" />
      <AppBadge v-if="sample" tone="gray">示例数据</AppBadge>
      <AppBadge :tone="review.tone">{{ review.label }}</AppBadge>
    </header>

    <p class="stem">{{ question.stem }}</p>

    <p class="meta">
      <template v-if="kps.length">考点 · {{ kps.join(' / ') }}</template>
      <template v-if="meta.difficulty"><span v-if="kps.length" class="dot">·</span>难度 {{ meta.difficulty }}/5</template>
      <span v-if="kps.length || meta.difficulty" class="dot">·</span>
      来自「再练一道同考点题」
    </p>
  </section>
</template>

<style scoped>
.brief {
  padding: 15px 18px 16px;
  border-radius: var(--wj-r-md);
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  box-shadow: var(--wj-shadow-1);
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.divider {
  width: 1px;
  height: 12px;
  background: var(--wj-border);
}

.source {
  font-size: 11.5px;
  color: var(--wj-text-3);
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spacer {
  flex: 1;
}

.stem {
  margin-top: 10px;
  font-size: 15px;
  line-height: 1.8;
  color: var(--wj-text);
}

.meta {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--wj-text-3);
}

.dot {
  color: var(--wj-border-strong);
}
</style>
