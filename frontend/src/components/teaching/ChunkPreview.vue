<script setup>
import { computed, ref } from 'vue'
import { estimateTokens } from '@/utils/chunk'
const props = defineProps({
  chunks: { type: Array, required: true },
  sourceLabel: { type: String, default: '' },
  defaultOpen: { type: Boolean, default: false }
})
const open = ref(props.defaultOpen)
const tokens = computed(() => props.chunks.reduce((n, c) => n + estimateTokens(c), 0))
/** 只展示每段开头，避免右栏被长文本撑开 */
function brief(text, max = 76) {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
</script>

<template>
  <section class="panel">
    <header class="head">
      <h2 class="title">本次上下文</h2>
      <button type="button" class="toggle" :aria-expanded="open" @click="open = !open">
        {{ open ? '收起' : '展开' }}
      </button>
    </header>

    <p class="summary">
      随 <code class="mono">/api/chat</code> 发送 <strong>{{ chunks.length }}</strong> 段切片 · 约
      <strong>{{ tokens }}</strong> tokens
    </p>
    <p v-if="sourceLabel" class="source">{{ sourceLabel }}</p>

    <ul v-if="open && chunks.length" class="list">
      <li v-for="(c, i) in chunks" :key="i">
        <span class="idx">{{ i + 1 }}</span>
        <p class="text">{{ brief(c) }}</p>
      </li>
    </ul>

    <p v-if="open && !chunks.length" class="empty">本次没有可用的本地资料，未发送上下文切片。</p>

    <p class="privacy">切片只在浏览器内生成，原文不会上传后端。</p>
  </section>
</template>

<style scoped>
.panel {
  padding: 14px 16px 14px;
  border-radius: var(--wj-r-md);
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  box-shadow: var(--wj-shadow-1);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.title {
  font-size: 13px;
  font-weight: 600;
}

.toggle {
  font-size: 11.5px;
  color: var(--wj-text-3);
}

.toggle:hover {
  color: var(--wj-primary-text);
}

.summary {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--wj-text-2);
}

.summary strong {
  color: var(--wj-text);
  font-family: var(--wj-font-mono);
}

.mono {
  font-family: var(--wj-font-mono);
  font-size: 11.5px;
  background: var(--wj-bg-chip);
  padding: 1px 4px;
  border-radius: 4px;
}

.source {
  margin-top: 2px;
  font-size: 11px;
  color: var(--wj-text-3);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--wj-divider);
}

.list li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.idx {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: var(--wj-bg-chip);
  color: var(--wj-text-3);
  font-size: 10px;
  display: grid;
  place-items: center;
  font-family: var(--wj-font-mono);
  margin-top: 2px;
}

.text {
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--wj-text-2);
}

.empty {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--wj-text-3);
}

.privacy {
  margin-top: 10px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--wj-text-3);
}
</style>
