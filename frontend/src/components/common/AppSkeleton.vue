<script setup>
/** 骨架块：只负责形状，具体排布由页面自己组合 */
defineProps({
  width: { type: String, default: '100%' },
  height: { type: String, default: '14px' },
  radius: { type: String, default: '6px' }
})
</script>

<template>
  <div class="wj-skeleton sk" :style="{ width, height, borderRadius: radius }" aria-hidden="true" />
</template>

<style scoped>
.sk {
  min-height: 8px;
}
</style>
