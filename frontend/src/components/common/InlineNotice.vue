<script setup>
/** 提示条：只有左侧 3px 竖线，没有边框 —— 与 PPT 原型的"预期提示"一致 */
defineProps({
  tone: { type: String, default: 'teal' },
  title: { type: String, default: '' }
})
</script>

<template>
  <div class="notice" :class="`t-${tone}`" role="note">
    <p v-if="title" class="title">{{ title }}</p>
    <div class="body"><slot /></div>
  </div>
</template>

<style scoped>
.notice {
  padding: 11px 14px;
  border-left: 3px solid var(--wj-teal);
  border-radius: 0 8px 8px 0;
  background: var(--wj-teal-weak);
  font-size: 14px;
  line-height: 1.75;
  color: var(--wj-text-2);
}

.t-warn {
  border-left-color: #e0a022;
  background: rgba(224, 160, 34, 0.08);
  color: var(--wj-warn-text);
}

.t-info {
  border-left-color: var(--wj-primary);
  background: var(--wj-bg-accent);
  color: var(--wj-primary-text);
}

.t-danger {
  border-left-color: #d92d20;
  background: var(--wj-danger-bg);
  color: var(--wj-danger-text);
}

.title {
  margin-bottom: 4px;
  font-weight: 600;
  font-size: 13px;
}

.body :deep(p) {
  margin: 0;
}
</style>
