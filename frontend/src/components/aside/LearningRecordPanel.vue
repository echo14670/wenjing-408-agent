<script setup>
import { computed } from 'vue'
const props = defineProps({
  done: { type: Number, required: true },
  total: { type: Number, required: true },
  asks: { type: Number, required: true },
  tokens: { type: Number, required: true },
  latencyMs: { type: Number, default: 0 },
  title: { type: String, default: '本次学习记录' }
})
const progress = computed(() => (props.total ? Math.round((props.done / props.total) * 100) : 0))
</script>

<template>
  <section class="panel">
    <h2 class="title">{{ title }}</h2>

    <div class="progress">
      <div class="track"><span class="fill" :style="{ width: `${progress}%` }" /></div>
      <p class="progress-text">已看 {{ done }} / {{ total }} 步</p>
    </div>

    <dl class="stats">
      <div>
        <dt>追问</dt>
        <dd>{{ asks }} 次</dd>
      </div>
      <div>
        <dt>上下文</dt>
        <dd>{{ tokens }} tokens</dd>
      </div>
      <div v-if="latencyMs">
        <dt>响应</dt>
        <dd>{{ latencyMs }} ms</dd>
      </div>
    </dl>

    <p class="note">记录保存在本浏览器，不上传后端。</p>
  </section>
</template>

<style scoped>
.panel {
  padding: 14px 16px 16px;
  border-radius: var(--wj-r-md);
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  box-shadow: var(--wj-shadow-1);
}

.title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}

.track {
  height: 6px;
  border-radius: 999px;
  background: var(--wj-bg-chip);
  overflow: hidden;
}

.fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--wj-teal);
  transition: width 320ms var(--wj-ease);
}

.progress-text {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--wj-text-3);
}

.stats {
  display: flex;
  gap: 16px;
  margin: 12px 0 0;
}

.stats dt {
  font-size: 11px;
  color: var(--wj-text-3);
}

.stats dd {
  margin: 2px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--wj-text);
  font-family: var(--wj-font-mono);
}

.note {
  margin-top: 12px;
  font-size: 11px;
  color: var(--wj-text-3);
}
</style>
