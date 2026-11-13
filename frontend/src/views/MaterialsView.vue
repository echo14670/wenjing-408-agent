<script setup>
import { ref } from 'vue'
import { useMaterialsStore } from '../store/materials'
import { downloadText } from '../utils/storage'

/**
 * MaterialsView —— 我的资料（P 包，需求 F06/F07）
 * 在原占位页基础上升级为可用资料库：
 *  - 列表展示、正文与切片预览、单条删除、清空；
 *  - 基于 materials-exchange v1 的导入/导出，导入先解析校验、展示条数/重复/错误，
 *    用户确认后才写入，取消不改动任何数据。
 * 资料仅保存在当前浏览器 localStorage，不进后端数据库。
 */

const materials = useMaterialsStore()
const importInput = ref(null)
const preview = ref(null) // 解析后的导入预览（确认前不写入）
const importError = ref('')
const notice = ref('')
const expandedId = ref(null)

function fmt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function onExport() {
  if (!materials.items.length) return
  const name = `问径个人资料_${new Date().toISOString().slice(0, 10)}.json`
  downloadText(name, materials.exportExchangeText())
  notice.value = '已导出当前资料库（仅资料，不含聊天记录与密钥）。'
}

function onImportFile(evt) {
  const file = evt.target.files?.[0]
  importError.value = ''
  preview.value = null
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const result = materials.previewImport(String(reader.result))
    if (!result.ok) {
      importError.value = result.error
    } else {
      preview.value = result
    }
    evt.target.value = ''
  }
  reader.readAsText(file, 'utf-8')
}

function confirmImport() {
  if (!preview.value) return
  const n = materials.confirmImport(preview.value.candidates)
  const { skipped, invalid } = preview.value
  notice.value = `导入完成：写入 ${n} 份，跳过重复 ${skipped.length} 份，无效 ${invalid.length} 份。`
  preview.value = null
}

function cancelImport() {
  preview.value = null
  notice.value = '已取消导入，资料库未做任何改动。'
}

function onClear() {
  if (window.confirm('确定清空全部个人资料？该操作不可恢复（资料仅保存在本浏览器）。')) {
    materials.clearAll()
    preview.value = null
    notice.value = '资料库已清空。'
  }
}

function toggle(id) {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <div class="materials-view">
    <div class="head">
      <div>
        <h2 class="page-title">我的资料</h2>
        <p class="page-sub">
          资料经前端无状态切片后仅保存在当前浏览器，随答疑请求以 context_chunks 透传，后端不落库；
          清理浏览器数据可能导致丢失，建议定期导出备份。
        </p>
      </div>
      <div class="actions">
        <button class="btn btn-ghost" :disabled="!materials.items.length" @click="onExport">导出 JSON</button>
        <button class="btn btn-ghost" @click="importInput?.click()">导入 JSON</button>
        <input ref="importInput" type="file" accept=".json,application/json" class="hidden" @change="onImportFile" />
        <button class="btn btn-danger" :disabled="!materials.items.length" @click="onClear">清空资料库</button>
      </div>
    </div>

    <p v-if="importError" class="msg msg-error">{{ importError }}</p>
    <p v-if="notice" class="msg msg-ok">{{ notice }}</p>

    <!-- 导入确认面板：确认前不写入 -->
    <div v-if="preview" class="card import-panel">
      <div class="import-head">
        <span class="import-title">导入预览</span>
        <span class="import-total">文件共 {{ preview.total }} 条</span>
      </div>
      <div class="import-stats">
        <span class="chip chip-ok">可导入 {{ preview.candidates.length }}</span>
        <span class="chip chip-skip">重复跳过 {{ preview.skipped.length }}</span>
        <span class="chip chip-bad">无效 {{ preview.invalid.length }}</span>
      </div>

      <ul v-if="preview.candidates.length" class="preview-list">
        <li v-for="c in preview.candidates" :key="c.material_id" class="preview-item">
          <span class="pi-title">{{ c.title }}</span>
          <span class="pi-meta">{{ c.file_type }} · 正文 {{ c.extracted_text.length }} 字</span>
        </li>
      </ul>
      <p v-else class="preview-empty">没有可写入的有效条目。</p>

      <div v-if="preview.invalid.length" class="reason-box">
        <p v-for="(it, i) in preview.invalid" :key="`bad-${i}`" class="reason reason-bad">
          #{{ it.index + 1 }} {{ it.title || '未命名' }}：{{ it.reason }}
        </p>
      </div>
      <div v-if="preview.skipped.length" class="reason-box">
        <p v-for="(it, i) in preview.skipped" :key="`skip-${i}`" class="reason reason-skip">
          #{{ it.index + 1 }} {{ it.title }}：{{ it.reason }}
        </p>
      </div>

      <div class="import-actions">
        <button class="btn btn-primary" :disabled="!preview.candidates.length" @click="confirmImport">确认写入</button>
        <button class="btn btn-ghost" @click="cancelImport">取消</button>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat card">
        <span class="stat-num">{{ materials.items.length }}</span>
        <span class="stat-label">份资料</span>
      </div>
      <div class="stat card">
        <span class="stat-num">{{ materials.totalChunks }}</span>
        <span class="stat-label">块切片</span>
      </div>
      <div class="stat card">
        <span class="stat-num">{{ materials.contextChunks.length }}</span>
        <span class="stat-label">随请求携带（context_chunks）</span>
      </div>
    </div>

    <div v-if="materials.items.length === 0" class="empty-state">
      <p class="empty-title">还没有个人资料</p>
      <p class="empty-sub">在「知识问答 → 上传题图」中勾选保存到个人资料库，或在此导入 JSON 备份。</p>
    </div>

    <div v-else class="mat-list">
      <div v-for="m in materials.items" :key="m.material_id" class="card mat-card">
        <div class="mat-head">
          <button class="mat-title-btn" @click="toggle(m.material_id)">
            <span class="caret" :class="{ open: expandedId === m.material_id }">▾</span>
            <span class="mat-title">{{ m.title }}</span>
          </button>
          <span class="mat-meta">
            {{ m.file_type }} · {{ m.chunks.length }} 块 · {{ fmt(m.created_at) }}
          </span>
          <button class="btn btn-ghost btn-sm" @click="materials.removeMaterial(m.material_id)">删除</button>
        </div>

        <div v-if="expandedId === m.material_id" class="mat-body">
          <p class="body-label">原始正文（extracted_text）</p>
          <p class="body-text">{{ m.extracted_text || m.chunks.map((c) => c.text).join('\n') }}</p>
        </div>

        <div class="chunk-list">
          <div v-for="c in m.chunks" :key="c.chunk_id" class="chunk">
            <span class="chunk-no">#{{ c.order }}</span>
            <span class="chunk-text">{{ c.text }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.materials-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--c-text);
  margin: 0;
}
.page-sub {
  font-size: 13px;
  color: var(--c-text-3);
  margin: 6px 0 0;
  max-width: 660px;
  line-height: 1.7;
}
.actions {
  display: flex;
  gap: 8px;
}
.btn {
  border: 1px solid var(--c-border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  padding: 8px 14px;
  background: var(--c-card);
  color: var(--c-text);
  transition: all 0.15s;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-ghost:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.btn-primary {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: #fff;
}
.btn-primary:hover {
  filter: brightness(1.05);
}
.btn-danger {
  color: var(--c-danger);
  border-color: #f3c1c1;
}
.btn-danger:hover {
  background: var(--c-danger-bg);
}
.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}
.hidden {
  display: none;
}
.msg {
  font-size: 13px;
  border-radius: 8px;
  padding: 8px 12px;
  margin: 0;
}
.msg-ok {
  color: var(--c-primary);
  background: var(--c-primary-soft);
  border: 1px solid #c6d8ff;
}
.msg-error {
  color: var(--c-danger);
  background: var(--c-danger-bg);
  border: 1px solid #f3c1c1;
}
.card {
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}
.import-panel {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.import-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.import-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--c-text);
}
.import-total {
  font-size: 12px;
  color: var(--c-text-3);
}
.import-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  font-size: 12px;
  border-radius: 999px;
  padding: 3px 10px;
}
.chip-ok {
  color: var(--c-primary);
  background: var(--c-primary-soft);
}
.chip-skip {
  color: #9a6a00;
  background: #fdf3dd;
}
.chip-bad {
  color: var(--c-danger);
  background: var(--c-danger-bg);
}
.preview-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.preview-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  background: var(--c-bg);
  border-radius: 6px;
  padding: 6px 10px;
}
.pi-title {
  color: var(--c-text);
}
.pi-meta {
  color: var(--c-text-3);
  font-size: 12px;
  flex-shrink: 0;
}
.preview-empty {
  font-size: 13px;
  color: var(--c-text-3);
  margin: 0;
}
.reason-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.reason {
  font-size: 12px;
  margin: 0;
  line-height: 1.6;
}
.reason-bad {
  color: var(--c-danger);
}
.reason-skip {
  color: #9a6a00;
}
.import-actions {
  display: flex;
  gap: 8px;
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.stat {
  padding: 16px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.stat-num {
  font-size: 26px;
  font-weight: 700;
  color: var(--c-primary);
}
.stat-label {
  font-size: 13px;
  color: var(--c-text-2);
}
.empty-state {
  background: var(--c-card);
  border: 1px dashed var(--c-border);
  border-radius: var(--radius);
  padding: 48px 20px;
  text-align: center;
}
.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--c-text-2);
  margin: 0 0 6px;
}
.empty-sub {
  font-size: 13px;
  color: var(--c-text-3);
  margin: 0;
  line-height: 1.7;
}
.mat-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mat-card {
  padding: 14px 16px;
}
.mat-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.mat-title-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  flex: 1;
  min-width: 160px;
  text-align: left;
}
.caret {
  color: var(--c-text-3);
  transition: transform 0.15s;
  font-size: 12px;
}
.caret.open {
  transform: rotate(180deg);
}
.mat-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text);
}
.mat-meta {
  font-size: 12px;
  color: var(--c-text-3);
}
.mat-body {
  margin-top: 10px;
  background: var(--c-bg);
  border-radius: 6px;
  padding: 10px 12px;
}
.body-label {
  font-size: 12px;
  color: var(--c-text-3);
  margin: 0 0 6px;
}
.body-text {
  font-size: 13px;
  color: var(--c-text-2);
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.7;
}
.chunk-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chunk {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--c-text-2);
  background: var(--c-bg);
  border-radius: 6px;
  padding: 6px 10px;
  line-height: 1.6;
}
.chunk-no {
  color: var(--c-primary);
  font-weight: 600;
  flex-shrink: 0;
}
.chunk-text {
  white-space: pre-wrap;
}
</style>
