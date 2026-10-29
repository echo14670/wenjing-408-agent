<script setup>
import { computed } from 'vue'
import { renderRich } from '@/utils/md'
const props = defineProps({
  content: { type: String, required: true },
  name: { type: String, default: '问径' },
  tag: { type: String, default: '' },
  tagTone: { type: String, default: 'teal' },
  avatar: { type: Boolean, default: true }
})
const html = computed(() => renderRich(props.content))
</script>

<template>
  <div class="bubble">
    <div v-if="avatar" class="avatar" aria-hidden="true">问</div>
    <div v-else class="avatar-space" aria-hidden="true" />
    <div class="body">
      <div class="meta">
        <span class="name">{{ name }}</span>
        <span v-if="tag" class="tag" :class="`t-${tagTone}`">{{ tag }}</span>
        <slot name="meta" />
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="rich" v-html="html" />
      <slot />
    </div>
  </div>
</template>

<style scoped>
.bubble {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--wj-bg-accent);
  color: var(--wj-primary-text);
  font-size: 13px;
  font-weight: 600;
  flex: none;
  margin-top: 1px;
}

.avatar-space {
  width: 28px;
  flex: none;
}

.body {
  min-width: 0;
  flex: 1;
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--wj-text);
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 19px;
  padding: 0 7px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 500;
}

.t-teal {
  background: var(--wj-success-bg);
  color: var(--wj-success-text);
}
.t-gray {
  background: #f1f3f8;
  color: var(--wj-text-2);
}
.t-blue {
  background: var(--wj-bg-accent);
  color: var(--wj-primary-text);
}
.t-amber {
  background: var(--wj-warn-bg);
  color: var(--wj-warn-text);
}

.rich {
  font-size: var(--wj-fs-body);
  line-height: var(--wj-lh-body);
  color: var(--wj-text);
}

.rich :deep(p) {
  margin: 0 0 12px;
}

.rich :deep(p:last-child) {
  margin-bottom: 0;
}

.rich :deep(strong) {
  font-weight: 600;
  color: var(--wj-text);
}

.rich :deep(.wj-rich-h) {
  font-size: 14.5px;
  font-weight: 600;
  margin: 14px 0 6px;
}

.rich :deep(.wj-code) {
  font-family: var(--wj-font-mono);
  font-size: 13px;
  background: var(--wj-bg-chip);
  padding: 1px 5px;
  border-radius: 4px;
}

.rich :deep(.wj-formula) {
  margin: 10px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--wj-bg-subtle);
  font-family: var(--wj-font-mono);
  font-size: 13px;
  color: var(--wj-text-2);
  white-space: pre-wrap;
  overflow-x: auto;
}

.rich :deep(.wj-list) {
  margin: 8px 0;
  padding-left: 18px;
  list-style: disc;
}

.rich :deep(.wj-list li) {
  margin: 4px 0;
}
</style>
