<script setup>
defineProps({
  index: { type: Number, required: true },
  title: { type: String, required: true },
  formula: { type: String, default: '' },
  done: { type: Boolean, default: false },
  current: { type: Boolean, default: false }
})
</script>

<template>
  <div class="row" :class="{ done, current }">
    <span class="idx" aria-hidden="true">{{ index }}</span>
    <span class="title">{{ title }}</span>
    <code v-if="formula" class="formula">{{ formula }}</code>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 9px 0;
}

.row + .row {
  border-top: 1px dashed var(--wj-divider);
}

.idx {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  color: var(--wj-primary-text);
  font-size: 11.5px;
  font-weight: 600;
  font-family: var(--wj-font-mono);
}

.done .idx {
  background: var(--wj-success-bg);
  border-color: transparent;
  color: var(--wj-success-text);
}

.current .idx {
  background: var(--wj-primary);
  border-color: transparent;
  color: #fff;
}

.title {
  font-size: 14px;
  color: var(--wj-text);
  font-weight: 500;
}

.formula {
  font-family: var(--wj-font-mono);
  font-size: 13px;
  color: var(--wj-text);
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  padding: 2px 8px;
  border-radius: 6px;
  white-space: nowrap;
}

@media (max-width: 560px) {
  .row {
    grid-template-columns: 22px minmax(0, 1fr);
  }
  .formula {
    grid-column: 2;
    justify-self: start;
    margin-top: 4px;
  }
}
</style>
