<script setup>
defineProps({
  tone: { type: String, default: 'gray' }
})
</script>

<template>
  <span class="badge" :class="`t-${tone}`"><slot /></span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.t-blue {
  background: var(--wj-bg-accent);
  color: var(--wj-primary-text);
}
.t-amber {
  background: var(--wj-warn-bg);
  color: var(--wj-warn-text);
}
.t-gray {
  background: #f1f3f8;
  color: var(--wj-text-2);
}
.t-teal {
  background: var(--wj-success-bg);
  color: var(--wj-success-text);
}
.t-danger {
  background: var(--wj-danger-bg);
  color: var(--wj-danger-text);
}
</style>
