<script setup>
import { nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { buildQuestionShareUrl } from '@/constants/routes'

const props = defineProps({
  questionId: { type: String, required: true }
})

const router = useRouter()
const button = ref(null)
const linkInput = ref(null)
const manualLink = ref('')
const message = ref('')

async function copyQuestionLink() {
  const url = buildQuestionShareUrl(router, props.questionId, window.location.href)
  message.value = ''
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      manualLink.value = ''
      message.value = '链接已复制'
      return
    }
  } catch {
    // HTTP 站点和部分浏览器会限制剪贴板 API。
  }

  manualLink.value = url
  await nextTick()
  linkInput.value?.focus()
  linkInput.value?.select()
  try {
    if (document.execCommand?.('copy')) {
      manualLink.value = ''
      message.value = '链接已复制'
      button.value?.focus()
      return
    }
  } catch {
    // 留下可选中的链接，方便手动复制。
  }
  message.value = '请手动复制链接'
}
</script>

<template>
  <div class="wb-question-share">
    <button ref="button" type="button" class="wb-secondary" @click="copyQuestionLink">复制题目链接</button>
    <span class="wb-note" role="status">{{ message }}</span>
    <input v-if="manualLink" ref="linkInput" class="wb-question-share-url"
      type="text" readonly :value="manualLink" aria-label="题目分享链接">
  </div>
</template>

<style scoped>
.wb-question-share {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-block: 8px;
}

.wb-question-share-url {
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  padding: 5px 9px;
  border: 1px solid var(--wb-control-border);
  border-radius: 8px;
  color: inherit;
  font: inherit;
}
</style>
