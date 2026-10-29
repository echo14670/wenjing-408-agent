<script setup>
import { useUiStore } from '@/store/ui'
const ui = useUiStore()
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast">
      <div v-for="t in ui.toasts" :key="t.id" class="toast" :class="`t-${t.tone}`" role="status">
        <span class="text">{{ t.text }}</span>
        <button type="button" class="close" aria-label="关闭提示" @click="ui.dismiss(t.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 90;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 380px;
  padding: 10px 12px 10px 14px;
  border-radius: 10px;
  background: #1f2937;
  color: #fff;
  font-size: 13px;
  line-height: 1.6;
  box-shadow: 0 8px 28px rgba(15, 27, 46, 0.24);
  pointer-events: auto;
}

.toast.t-warn {
  background: #7c4a03;
}

.toast.t-success {
  background: #0f5f58;
}

.text {
  flex: 1;
}

.close {
  color: rgba(255, 255, 255, 0.7);
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
}

.close:hover {
  color: #fff;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 160ms var(--wj-ease),
    transform 160ms var(--wj-ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
