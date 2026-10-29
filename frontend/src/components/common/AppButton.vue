<script setup>
defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'md' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
  title: { type: String, default: '' }
})
defineEmits(['click'])
</script>

<template>
  <button
    type="button"
    class="btn"
    :class="[`v-${variant}`, `s-${size}`, { block, loading }]"
    :disabled="disabled || loading"
    :title="title"
    :aria-busy="loading || undefined"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--wj-r-sm);
  font-weight: 500;
  white-space: nowrap;
  transition:
    background var(--wj-dur) var(--wj-ease),
    border-color var(--wj-dur) var(--wj-ease),
    color var(--wj-dur) var(--wj-ease),
    transform 80ms var(--wj-ease);
  user-select: none;
}

.s-md {
  height: 36px;
  padding: 0 18px;
  font-size: 14px;
}

.s-sm {
  height: 30px;
  padding: 0 12px;
  font-size: 13px;
}

.block {
  width: 100%;
}

.v-primary {
  background: var(--wj-primary);
  color: #fff;
  box-shadow: 0 1px 2px rgba(47, 90, 224, 0.24);
}
.v-primary:hover:not(:disabled) {
  background: var(--wj-primary-hover);
}
.v-primary:active:not(:disabled) {
  transform: translateY(1px);
}

.v-outline {
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  color: var(--wj-text-2);
}
.v-outline:hover:not(:disabled) {
  border-color: var(--wj-primary);
  color: var(--wj-primary-text);
}

.v-ghost {
  background: transparent;
  color: var(--wj-primary-text);
}
.v-ghost:hover:not(:disabled) {
  background: var(--wj-primary-weak);
}

.v-danger {
  background: var(--wj-danger-bg);
  color: var(--wj-danger-text);
}
.v-danger:hover:not(:disabled) {
  background: #fde8e6;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.spinner {
  width: 13px;
  height: 13px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2s;
  }
}
</style>
