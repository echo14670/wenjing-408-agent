<script setup>
/** 窄栏阅读流：答案页专用，760px 居中，长文阅读眼睛不疲劳 */
</script>

<template>
  <div class="narrow">
    <slot />
  </div>
</template>

<style scoped>
.narrow {
  width: 100%;
  max-width: var(--wj-w-read);
  margin: 0 auto;
  padding: 24px 24px 96px;
  display: flex;
  flex-direction: column;
  gap: var(--wj-gap-4);
}

@media (max-width: 720px) {
  .narrow {
    padding: 16px 14px 72px;
  }
}
</style>
