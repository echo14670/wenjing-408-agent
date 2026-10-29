<script setup>
import AppButton from '@/components/common/AppButton.vue'
import { ref } from 'vue'
const props = defineProps({
  disabled: { type: Boolean, default: false },
  disabledReason: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  errorText: { type: String, default: '' },
  placeholder: { type: String, default: '继续追问：为什么这样算？哪一步还不清楚？' },
  suggestions: { type: Array, default: () => [] }
})
const emit = defineEmits(['send', 'retry'])
const text = ref('')
function submit() {
  const value = text.value.trim()
  if (!value || props.disabled || props.loading) return
  emit('send', value)
  text.value = ''
}
function useSuggestion(s) {
  text.value = s
}
function onKeydown(ev) {
  // Enter 发送，Shift+Enter 换行
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault()
    submit()
  }
}
</script>

<template>
  <section class="box" :class="{ disabled }">
    <div class="head">
      <h2 class="title">追问</h2>
      <span v-if="disabled" class="reason">{{ disabledReason }}</span>
      <span v-else class="tip">模型会结合你的作答与本地资料回答</span>
    </div>

    <ul v-if="suggestions.length && !disabled" class="suggestions">
      <li v-for="s in suggestions" :key="s">
        <button type="button" @click="useSuggestion(s)">{{ s }}</button>
      </li>
    </ul>

    <div class="input-wrap">
      <textarea
        v-model="text"
        class="input"
        rows="2"
        :placeholder="disabled ? disabledReason : placeholder"
        :disabled="disabled"
        :aria-label="'追问输入框'"
        @keydown="onKeydown"
      />
      <div class="actions">
        <span class="counter">{{ text.length }}/500</span>
        <AppButton size="sm" :disabled="disabled || !text.trim()" :loading="loading" @click="submit"> 发送 </AppButton>
      </div>
    </div>

    <p v-if="errorText" class="error" role="alert">
      {{ errorText }}
      <button type="button" class="retry" @click="$emit('retry')">重试</button>
    </p>
  </section>
</template>

<style scoped>
.box {
  padding: 16px 20px 18px;
  border-radius: var(--wj-r-md);
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  box-shadow: var(--wj-shadow-1);
}

.box.disabled {
  background: var(--wj-bg-subtle);
  border-style: dashed;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.title {
  font-size: 14px;
  font-weight: 600;
}

.reason {
  font-size: 12px;
  color: var(--wj-warn-text);
}

.tip {
  font-size: 12px;
  color: var(--wj-text-3);
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.suggestions button {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--wj-r-pill);
  background: var(--wj-bg-accent);
  color: var(--wj-primary-text);
  font-size: 12px;
}

.suggestions button:hover {
  background: #e3eafc;
}

.input-wrap {
  border: 1px solid var(--wj-border);
  border-radius: 10px;
  padding: 10px 12px 8px;
  background: var(--wj-bg-surface);
  transition: border-color var(--wj-dur) var(--wj-ease);
}

.input-wrap:focus-within {
  border-color: var(--wj-primary);
}

.input {
  width: 100%;
  border: none;
  outline: none;
  resize: vertical;
  min-height: 44px;
  font-size: 14px;
  line-height: 1.7;
  background: transparent;
}

.input::placeholder {
  color: var(--wj-text-3);
}

.input:disabled {
  cursor: not-allowed;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.counter {
  font-size: 11px;
  color: var(--wj-text-3);
  font-family: var(--wj-font-mono);
}

.error {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--wj-danger-text);
}

.retry {
  margin-left: 6px;
  text-decoration: underline;
  text-underline-offset: 3px;
  color: var(--wj-danger-text);
}
</style>
