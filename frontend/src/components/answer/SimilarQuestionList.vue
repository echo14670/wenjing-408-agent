<script setup>
import AppBadge from '@/components/common/AppBadge.vue'
defineProps({
  items: { type: Array, required: true },
  disabled: { type: Boolean, default: true },
  disabledReason: { type: String, default: '相似题仅供参考，不进入作答与追问流程' },
  title: { type: String, default: '相似题' }
})
defineEmits(['select'])
</script>

<template>
  <section class="sim">
    <header class="head">
      <h2 class="title">{{ title }}</h2>
      <AppBadge tone="amber">相似题 · 仅供参考</AppBadge>
    </header>

    <ul class="list">
      <li v-for="(item, i) in items" :key="item.id ?? i" class="item" :class="{ disabled }">
        <span class="idx">{{ i + 1 }}</span>
        <div class="body">
          <p class="text">{{ item.text }}</p>
          <p class="meta">
            <span v-if="item.id" class="mono">{{ item.id }}</span>
            <span v-if="item.similarity !== null">相似度 {{ Math.round((item.similarity ?? 0) * 100) }}%</span>
          </p>
        </div>
        <button
          type="button"
          class="act"
          :disabled="disabled"
          :title="disabled ? disabledReason : '查看相似题'"
          @click="$emit('select', item)"
        >
          查看
        </button>
      </li>
    </ul>

    <p class="foot">{{ disabledReason }}</p>
  </section>
</template>

<style scoped>
.sim {
  padding: 16px 20px 18px;
  border-radius: var(--wj-r-md);
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  box-shadow: var(--wj-shadow-1);
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.title {
  font-size: 14.5px;
  font-weight: 600;
}

.list {
  display: flex;
  flex-direction: column;
}

.item {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 12px 0;
}

.item + .item {
  border-top: 1px solid var(--wj-divider);
}

.idx {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--wj-bg-chip);
  color: var(--wj-text-2);
  font-size: 11.5px;
  font-family: var(--wj-font-mono);
}

.text {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--wj-text);
}

.disabled .text {
  color: var(--wj-text-2);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--wj-text-3);
}

.mono {
  font-family: var(--wj-font-mono);
}

.reason {
  color: var(--wj-warn-text);
}

.foot {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--wj-divider);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--wj-warn-text);
}

.act {
  height: 28px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid var(--wj-border);
  font-size: 12.5px;
  color: var(--wj-text-2);
}

.act:hover:not(:disabled) {
  border-color: var(--wj-primary);
  color: var(--wj-primary-text);
}

.act:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
