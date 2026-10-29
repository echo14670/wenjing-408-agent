<script setup>
const props = defineProps({
  mode: { type: String, required: true },
  disabled: { type: Boolean }
})
const emit = defineEmits(['change'])
const options = [
  { value: 'guided', label: '引导学习', hint: '先定位问题，再逐步提示' },
  { value: 'direct', label: '直接讲解', hint: '完整讲解与依据同屏' }
]
function pick(value) {
  if (props.disabled || value === props.mode) return
  emit('change', value)
}
</script>

<template>
  <div class="switch" role="group" aria-label="讲解模式">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="opt"
      :class="{ active: mode === opt.value }"
      :disabled="disabled"
      :title="opt.hint"
      :aria-pressed="mode === opt.value"
      @click="pick(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.switch {
  display: inline-flex;
  padding: 2px;
  border-radius: var(--wj-r-sm);
  border: 1px solid var(--wj-border);
  background: var(--wj-bg-surface);
}

.opt {
  height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--wj-text-2);
  transition:
    background var(--wj-dur) var(--wj-ease),
    color var(--wj-dur) var(--wj-ease);
}

.opt:hover:not(:disabled):not(.active) {
  color: var(--wj-primary-text);
}

.opt.active {
  background: var(--wj-bg-accent);
  color: var(--wj-primary-text);
  font-weight: 500;
}

.opt:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
