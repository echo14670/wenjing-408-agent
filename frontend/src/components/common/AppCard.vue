<script setup>
/** 白卡片容器：圆角 12、1px 描边、极轻阴影，与 PPT 原型一致 */
defineProps({
  variant: { type: String, default: 'default' },
  padding: { type: String, default: 'md' },
  as: { type: String, default: 'section' }
})
</script>

<template>
  <component :is="as" class="card" :class="[`is-${variant}`, `p-${padding}`]">
    <slot />
  </component>
</template>

<style scoped>
.card {
  background: var(--wj-bg-surface);
  border: 1px solid var(--wj-border);
  border-radius: var(--wj-r-md);
  box-shadow: var(--wj-shadow-2);
}

.is-muted {
  background: var(--wj-bg-subtle);
  border-color: transparent;
  box-shadow: var(--wj-shadow-1);
}

.is-quote {
  background: var(--wj-bg-quote);
  border-color: transparent;
  box-shadow: none;
}

.is-plain {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.p-sm {
  padding: 14px 16px;
}
.p-md {
  padding: 18px 22px;
}
.p-lg {
  padding: 22px 26px;
}
</style>
