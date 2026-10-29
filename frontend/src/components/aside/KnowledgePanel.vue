<script setup>
defineProps({
  points: { type: Array, required: true },
  title: { type: String, default: '关联知识点' }
})
</script>

<template>
  <section v-if="points.length" class="panel">
    <h2 class="title">{{ title }}</h2>
    <ul class="tags">
      <li v-for="p in points" :key="p">{{ p }}</li>
    </ul>
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

.title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tags li {
  padding: 3px 9px;
  border-radius: var(--wj-r-pill);
  background: var(--wj-bg-accent);
  color: var(--wj-primary-text);
  font-size: 11.5px;
}
</style>
