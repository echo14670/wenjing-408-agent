<script setup>
import { computed } from 'vue'
import { renderRich } from '@/utils/md'
const props = defineProps({
  content: { type: String, required: true },
  title: { type: String }
})
const html = computed(() => renderRich(props.content))
</script>

<template>
  <section class="section">
    <h2 v-if="title" class="title">{{ title }}</h2>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div class="rich" v-html="html" />
  </section>
</template>

<style scoped>
.section {
  padding: 20px 24px 22px;
  border-radius: var(--wj-r-md);
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  box-shadow: var(--wj-shadow-2);
}

.title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 10px;
}

.rich {
  font-size: 15px;
  line-height: 1.95;
  color: var(--wj-text);
}

.rich :deep(p) {
  margin: 0 0 12px;
}

.rich :deep(p:last-child) {
  margin-bottom: 0;
}

.rich :deep(strong) {
  font-weight: 600;
}

.rich :deep(.wj-rich-h) {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--wj-primary-text);
  margin: 16px 0 6px;
}

.rich :deep(.wj-formula) {
  margin: 12px 0;
  padding: 12px 14px;
  border-radius: 9px;
  background: var(--wj-bg-subtle);
  border: 1px solid var(--wj-border);
  font-family: var(--wj-font-mono);
  font-size: 13px;
  color: var(--wj-text);
  white-space: pre-wrap;
  overflow-x: auto;
}

.rich :deep(.wj-list) {
  margin: 8px 0 12px;
  padding-left: 20px;
  list-style: disc;
}

.rich :deep(.wj-list li) {
  margin: 4px 0;
}

.rich :deep(.wj-code) {
  font-family: var(--wj-font-mono);
  font-size: 13px;
  background: var(--wj-bg-chip);
  padding: 1px 5px;
  border-radius: 4px;
}
</style>
