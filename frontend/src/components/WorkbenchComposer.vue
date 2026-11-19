<script setup>
import { computed, ref } from 'vue'

const draft = defineModel({ type: String, required: true })
const intent = defineModel('intent', { type: String, required: true })
const props = defineProps({
  compact: Boolean,
  busy: Boolean,
  available: { type: Boolean, default: true },
  placeholder: { type: String, required: true }
})
const emit = defineEmits(['send'])
const input = ref(null)
const inputLimit = computed(() => !props.compact && intent.value === 'search' ? 4000 : 6000)
const tooLong = computed(() => draft.value.trim().length > inputLimit.value)
const canSend = computed(() => !props.busy && props.available && draft.value.trim().length > 0 && !tooLong.value)

defineExpose({ focus: () => input.value?.focus() })

function send() {
  if (canSend.value) emit('send')
}

function onEnter(event) {
  if (event.isComposing || event.keyCode === 229 || event.shiftKey ||
      event.ctrlKey || event.metaKey || event.altKey) return
  event.preventDefault()
  send()
}
</script>

<template>
  <form class="wb-composer" :class="{ 'wb-composer-compact': compact }" @submit.prevent="send">
    <textarea
      ref="input"
      v-model="draft"
      aria-label="学习输入"
      :placeholder="placeholder"
      :rows="compact ? 2 : 3"
      :maxlength="inputLimit"
      :aria-invalid="tooLong || undefined"
      @keydown.enter="onEnter"
    />
    <p v-if="tooLong" class="wb-composer-limit" role="status">最多可输入 {{ inputLimit }} 字，请删减后发送。</p>
    <div class="wb-composer-bar">
      <div v-if="!compact" class="wb-intents" role="group" aria-label="输入用途">
        <button type="button" :aria-pressed="intent === 'concept'" @click="intent = 'concept'">
          <span class="wb-i wb-i-chat" aria-hidden="true"></span> 问知识点
        </button>
        <button type="button" :aria-pressed="intent === 'search'" @click="intent = 'search'">
          <span class="wb-i wb-i-search" aria-hidden="true"></span> 搜题
        </button>
      </div>
      <slot v-else name="tools" />
      <div class="wb-send-group">
        <span v-if="!busy && !compact" class="wb-key-hint">Enter 发送</span>
        <button type="submit" class="wb-send" :disabled="!canSend"
          :aria-label="compact ? '发送追问' : (intent === 'concept' ? '发送问题' : '搜索题库')">
          {{ busy ? '处理中' : (compact ? '发送' : (intent === 'concept' ? '提问' : '搜索')) }}
        </button>
      </div>
    </div>
  </form>
</template>
