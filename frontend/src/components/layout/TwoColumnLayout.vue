<script setup>
/** 左内容 + 右辅助栏：步骤页与教学模式页共用 */
</script>

<template>
  <div class="two-col">
    <div class="content"><slot /></div>
    <aside class="aside" aria-label="辅助信息">
      <slot name="aside" />
    </aside>
  </div>
</template>

<style scoped>
.two-col {
  width: 100%;
  max-width: var(--wj-w-max);
  margin: 0 auto;
  padding: 24px 32px 96px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--wj-w-aside);
  gap: var(--wj-gap-4);
  align-items: start;
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--wj-gap-4);
  min-width: 0;
}

.aside {
  position: sticky;
  top: calc(var(--wj-header-h) + 16px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-self: start;
}

@media (max-width: 1100px) {
  .two-col {
    grid-template-columns: 1fr;
    padding: 20px 20px 80px;
  }
  .aside {
    position: static;
  }
}
</style>
