<script setup>
import AppButton from '@/components/common/AppButton.vue'
const props = defineProps({
  current: { type: Number, required: true },
  total: { type: Number, required: true },
  canCheck: { type: Boolean, required: true },
  stuckLoading: { type: Boolean, default: false }
})
const emit = defineEmits(['prev', 'next', 'stuck', 'check'])
const atFirst = () => props.current <= 0
const atLast = () => props.current >= props.total - 1
</script>

<template>
  <div class="nav">
    <div class="left">
      <AppButton size="sm" variant="outline" :disabled="atFirst()" @click="emit('prev')">上一步</AppButton>
      <AppButton size="sm" :disabled="atLast()" @click="emit('next')">下一步</AppButton>
      <button type="button" class="stuck" :disabled="stuckLoading" @click="emit('stuck')">
        {{ stuckLoading ? '正在生成更细的提示…' : '我卡住了' }}
      </button>
    </div>
    <div class="right">
      <span class="progress">{{ current + 1 }} / {{ total }}</span>
      <AppButton v-if="atLast()" size="sm" :disabled="!canCheck" @click="emit('check')">核对答案</AppButton>
    </div>
  </div>
</template>

<style scoped>
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--wj-divider);
}

.left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.stuck {
  height: 30px;
  padding: 0 10px;
  border-radius: var(--wj-r-sm);
  font-size: 12.5px;
  color: var(--wj-teal);
}

.stuck:hover:not(:disabled) {
  background: var(--wj-teal-weak);
}

.stuck:disabled {
  color: var(--wj-text-3);
  cursor: progress;
}

.right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress {
  font-family: var(--wj-font-mono);
  font-size: 12px;
  color: var(--wj-text-3);
}
</style>
