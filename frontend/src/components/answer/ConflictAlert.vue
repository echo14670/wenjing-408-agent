<script setup>
import AppBadge from '@/components/common/AppBadge.vue'
import { renderRich } from '@/utils/md'
import { computed } from 'vue'
/**
 * 解析冲突提示。
 * 业务红线：模型讲解与题库答案相悖时必须同屏展示差异，且不能覆盖原答案。
 * 因此这里是只读对比，不提供"采用模型答案"之类的一键覆盖按钮。
 */
const props = defineProps({
  bankAnswer: { type: String, required: true },
  modelText: { type: String, required: true },
  diffs: { type: Array, required: true }
})
const modelHtml = computed(() => renderRich(props.modelText))
</script>

<template>
  <section class="conflict" role="alert">
    <header class="head">
      <AppBadge tone="danger">解析冲突</AppBadge>
      <p class="title">模型讲解与题库核验解析的结论不一致</p>
    </header>
    <p class="desc">
      按项目规则，图书馆藏解析优先展示，模型的不同结论只作为参考并列呈现，不会覆盖原答案。 差异项：<strong>{{
        diffs.join('、')
      }}</strong>
    </p>

    <div class="grid">
      <div class="col bank">
        <p class="col-label">题库核验答案</p>
        <p class="col-body">{{ bankAnswer }}</p>
      </div>
      <div class="col model">
        <p class="col-label">模型讲解（片段）</p>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="col-body rich" v-html="modelHtml" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.conflict {
  padding: 16px 20px 18px;
  border-radius: var(--wj-r-md);
  background: var(--wj-danger-bg);
  border: 1px solid #f5cdc8;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: var(--wj-danger-text);
}

.desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: #7a271a;
}

.desc strong {
  font-weight: 600;
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 12px;
  margin-top: 12px;
}

.col {
  padding: 12px 14px;
  border-radius: 9px;
  background: var(--wj-bg-surface);
}

.col-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--wj-text-3);
  margin-bottom: 6px;
}

.col-body {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--wj-text);
}

.rich :deep(p) {
  margin: 0 0 8px;
}
.rich :deep(p:last-child) {
  margin-bottom: 0;
}
.rich :deep(strong) {
  font-weight: 600;
}
.rich :deep(.wj-formula) {
  font-family: var(--wj-font-mono);
  font-size: 12.5px;
  background: var(--wj-bg-subtle);
  padding: 6px 8px;
  border-radius: 6px;
  white-space: pre-wrap;
}

@media (max-width: 780px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
