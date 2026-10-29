<script setup>
import { computed } from 'vue'
import { percent } from '@/utils/format'
const props = defineProps({
  segments: { type: Array, required: true }
})
const total = computed(() => props.segments.reduce((n, s) => n + s.bits, 0))
const items = computed(() =>
  props.segments.map((s) => ({
    ...s,
    grow: total.value ? s.bits / total.value : 1,
    tip: `${s.label} · ${s.bits} 位 · 占 ${percent(s.bits, total.value)}`
  }))
)
</script>

<template>
  <div
    class="bar"
    role="img"
    :aria-label="`地址字段划分：${segments.map((s) => `${s.label} ${s.bits} 位`).join('，')}`"
  >
    <div
      v-for="item in items"
      :key="item.label"
      class="seg"
      :class="`c-${item.tone}`"
      :style="{ flexGrow: item.grow }"
      :title="item.tip"
    >
      <span>{{ item.label }} {{ item.bits }} 位</span>
    </div>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  height: 30px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--wj-bg-chip);
}

.seg {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  overflow: hidden;
  white-space: nowrap;
  transition: flex-grow 240ms var(--wj-ease);
}

.seg + .seg {
  box-shadow:
    inset 2px 0 0 #fff,
    inset -0 0 0 #fff;
}

.seg span {
  padding: 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-primary {
  background: var(--wj-primary);
}
.c-teal {
  background: var(--wj-teal);
}
.c-slate {
  background: var(--wj-slate);
}

@media (max-width: 520px) {
  .seg {
    font-size: 11px;
  }
}
</style>
