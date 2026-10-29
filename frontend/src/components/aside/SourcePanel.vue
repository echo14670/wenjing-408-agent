<script setup>
import AppBadge from '@/components/common/AppBadge.vue'
defineProps({
  citations: { type: Array, required: true },
  sourceRef: { type: String, default: null },
  toolResult: { type: String, default: null },
  title: { type: String, default: '回答依据' },
  emptyHint: { type: String, default: '未检索到教材页码或真题出处，本次回答为模型推断。' }
})
</script>

<template>
  <section class="panel">
    <header class="head">
      <h2 class="title">{{ title }}</h2>
    </header>

    <p v-if="sourceRef" class="source"><span class="k">题库</span>{{ sourceRef }}</p>

    <ul v-if="citations.length" class="list">
      <li v-for="(c, i) in citations" :key="i" class="item">
        <span class="idx" aria-hidden="true">{{ i + 1 }}</span>
        <div>
          <p class="text">{{ c.text }}</p>
          <AppBadge v-if="c.sample" tone="blue">示例引用</AppBadge>
        </div>
      </li>
    </ul>

    <p v-else class="empty">{{ emptyHint }}</p>

    <p v-if="toolResult" class="tool"><span class="k">检索</span>{{ toolResult }}</p>
  </section>
</template>

<style scoped>
.panel {
  padding: 14px 16px 16px;
  border-radius: var(--wj-r-md);
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  box-shadow: var(--wj-shadow-1);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: var(--wj-text);
}

.source {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--wj-text-2);
  margin-bottom: 8px;
}

.k {
  flex: none;
  font-size: 10.5px;
  color: var(--wj-text-3);
  border: 1px solid var(--wj-border);
  border-radius: 4px;
  padding: 1px 4px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.idx {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: var(--wj-bg-chip);
  color: var(--wj-text-3);
  font-size: 10.5px;
  font-family: var(--wj-font-mono);
  flex: none;
  margin-top: 1px;
}

.text {
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--wj-text-2);
  margin-bottom: 4px;
}

.empty {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--wj-text-3);
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--wj-bg-subtle);
}

.tool {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--wj-divider);
  font-size: 12px;
  line-height: 1.6;
  color: var(--wj-text-3);
}
</style>
