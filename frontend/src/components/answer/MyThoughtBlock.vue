<script setup>
defineProps({
  text: { type: String, required: true },
  label: { type: String, default: '我的思路' },
  editable: { type: Boolean, default: false }
})
defineEmits(['edit'])
</script>

<template>
  <div class="thought">
    <div class="head">
      <span class="label">{{ label }}</span>
      <button v-if="editable" type="button" class="edit" @click="$emit('edit')">修改</button>
    </div>
    <p v-if="text" class="text">{{ text }}</p>
    <p v-else class="placeholder">还没有填写当前理解。填一句你的思路，讲解会针对它展开。</p>
  </div>
</template>

<style scoped>
.thought {
  padding: 16px 18px;
  border-radius: var(--wj-r-md);
  background: var(--wj-bg-quote);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.label {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 5px;
  background: var(--wj-primary-weak);
  color: var(--wj-primary-text);
  font-size: 11.5px;
  font-weight: 500;
}

.edit {
  font-size: 12px;
  color: var(--wj-text-3);
}

.edit:hover {
  color: var(--wj-primary-text);
}

.text {
  margin-top: 8px;
  font-size: 16px;
  line-height: 1.8;
  color: var(--wj-text);
}

.placeholder {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--wj-text-3);
}
</style>
