<script setup>
import AppButton from './AppButton.vue'
import { computed, ref } from 'vue'
const props = defineProps({
  error: { type: Object, required: true },
  attempts: { type: Number, default: 1 },
  compact: { type: Boolean, default: false }
})
defineEmits(['retry', 'fallback'])
const showDetail = ref(false)
const isTimeout = computed(() => props.error.kind === 'timeout')
const title = computed(() => (isTimeout.value ? '请求超时' : '请求失败'))
const hint = computed(() => {
  if (isTimeout.value) return '后端或 Mock 服务 10 秒内没有响应。可以稍等重试，或先看演示数据。'
  if (props.error.kind === 'network') return '网络不可达。请确认本地代理或 Mock 地址是否可用。'
  return '服务返回了错误。可以先重试；若持续失败，说明后端或 Mock 出了状况。'
})
</script>

<template>
  <div class="err" :class="{ compact }" role="alert">
    <div class="head">
      <span class="dot" :class="{ warn: isTimeout }" aria-hidden="true">
        <svg v-if="isTimeout" viewBox="0 0 24 24" width="20" height="20" fill="none">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6" />
          <path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none">
          <path d="M12 4.5l8.5 15h-17z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <path d="M12 9.5v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          <circle cx="12" cy="16.4" r="0.9" fill="currentColor" />
        </svg>
      </span>
      <div>
        <p class="title">
          {{ title }}<span class="code">{{ error.code }}</span>
        </p>
        <p class="msg">{{ error.message }}</p>
      </div>
    </div>

    <p class="hint">{{ hint }}</p>

    <div class="actions">
      <AppButton size="sm" @click="$emit('retry')">重新请求</AppButton>
      <AppButton v-if="attempts >= 2" size="sm" variant="outline" @click="$emit('fallback')">
        切换到演示数据
      </AppButton>
      <button v-if="error.detail" class="detail-toggle" type="button" @click="showDetail = !showDetail">
        {{ showDetail ? '收起详情' : '查看详情' }}
      </button>
    </div>

    <pre v-if="showDetail && error.detail" class="detail">{{ error.detail }}</pre>
  </div>
</template>

<style scoped>
.err {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 26px 24px;
  border-radius: var(--wj-r-md);
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  box-shadow: var(--wj-shadow-1);
}

.err.compact {
  padding: 16px 18px;
}

.head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.dot {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--wj-danger-bg);
  color: var(--wj-danger-text);
  flex: none;
}

.dot.warn {
  background: var(--wj-warn-bg);
  color: var(--wj-warn-text);
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}

.code {
  font-family: var(--wj-font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--wj-text-3);
  background: var(--wj-bg-chip);
  padding: 2px 6px;
  border-radius: 4px;
}

.msg {
  margin-top: 2px;
  font-size: 13px;
  color: var(--wj-text-2);
}

.hint {
  font-size: 13px;
  line-height: 1.7;
  color: var(--wj-text-3);
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-toggle {
  font-size: 12px;
  color: var(--wj-text-3);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.detail {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--wj-bg-chip);
  font-family: var(--wj-font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--wj-text-2);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
