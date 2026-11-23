<script setup>
import { computed, ref } from 'vue'
import { useHistoryStore } from '@/store/history'
import { useMaterialsStore } from '@/store/materials'
import { downloadText } from '@/utils/storage'

const props = defineProps({ kind: { type: String, required: true } })
const history = useHistoryStore()
const materials = useMaterialsStore()
const isHistory = computed(() => props.kind === 'history')
const label = computed(() => isHistory.value ? '学习记录' : '资料')
const store = computed(() => isHistory.value ? history : materials)
const hasItems = computed(() => (isHistory.value ? history.sessions : materials.items).length > 0)
const fileInput = ref(null)
const preview = ref(null)
const notice = ref('')
const error = ref('')
let readId = 0

function exportBackup() {
  const data = isHistory.value ? history.exportJSON() : materials.exportExchangeText()
  const date = new Date().toISOString().slice(0, 10)
  downloadText('问径' + label.value + '_' + date + '.json', data)
}

function resetPreview() {
  readId++
  preview.value = null
  notice.value = ''
  error.value = ''
}

async function readBackup(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  resetPreview()
  const currentId = readId
  try {
    const text = await file.text()
    if (currentId !== readId) return
    const result = store.value.previewImport(text)
    if (result.ok === false) throw new Error(result.error)
    preview.value = result
  } catch (failure) {
    if (currentId === readId) error.value = failure.message || '读取备份失败。'
  }
}

function importBackup() {
  const candidate = preview.value
  if (!candidate?.candidates.length) return
  try {
    const added = isHistory.value ? history.confirmImport(candidate).added : materials.confirmImport(candidate.candidates)
    resetPreview()
    notice.value = '已导入 ' + added + ' 条' + label.value + '。'
  } catch (failure) {
    error.value = failure.message
  }
}

function clear() {
  if (!window.confirm('确定清空全部' + label.value + '？此操作无法撤销。')) return
  store.value.clearAll()
  resetPreview()
  notice.value = '已清空' + label.value + '。'
}
</script>

<template>
  <section class="wb-backup" :aria-label="label + '备份'">
    <div class="wb-backup-actions">
      <button type="button" class="wb-secondary" :disabled="!hasItems" @click="exportBackup">导出备份</button>
      <button type="button" class="wb-secondary" @click="fileInput?.click()">导入备份</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden :aria-label="'选取' + label + '备份'" @change="readBackup">
      <button type="button" class="wb-link wb-delete" :disabled="!hasItems" @click="clear">清空{{ label }}</button>
    </div>
    <div v-if="preview" class="wb-backup-preview">
      <p>可导入 {{ preview.candidates.length }} 条，跳过重复 {{ preview.skipped.length }} 条，无效 {{ preview.invalid.length }} 条。</p>
      <ul v-if="preview.invalid.length">
        <li v-for="entry in preview.invalid" :key="entry.index">第 {{ entry.index + 1 }} 条。{{ entry.reason }}</li>
      </ul>
      <div class="wb-backup-actions">
        <button type="button" class="wb-primary" :disabled="!preview.candidates.length" @click="importBackup">确认导入备份</button>
        <button type="button" class="wb-secondary" @click="resetPreview">取消</button>
      </div>
    </div>
    <p v-if="error" class="wb-notice wb-warning" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="wb-notice" role="status">{{ notice }}</p>
  </section>
</template>
