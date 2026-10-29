<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHistoryStore } from '../store/history'
import { downloadText } from '../utils/storage'
import MatchTypeBadge from '../components/MatchTypeBadge.vue'

/**
 * HistoryView —— 学习记录（郑志銮 · 本地问答历史，需求 F07）
 * 支持查看、删除、导出、导入、清空；提示清理浏览器数据会导致记录丢失。
 */

const history = useHistoryStore()
const router = useRouter()
function resume(s) {
  history.setCurrent(s.session_id)
  router.push({ path: '/answer', query: { q: s.question_stem, sid: s.session_id, mode: s.mode, mock: 'auto' } })
}
const expandedId = ref(null)
const importInput = ref(null)
const importMsg = ref('')

const modeLabel = { direct: '直接讲解', guided: '引导学习' }

function toggle(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function onExport() {
  downloadText(`问径学习记录_${new Date().toISOString().slice(0, 10)}.json`, history.exportJSON())
}

function onImportFile(evt) {
  const f = evt.target.files?.[0]
  if (!f) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const n = history.importJSON(String(reader.result))
      importMsg.value = `导入成功：新增 ${n} 条会话记录`
    } catch (e) {
      importMsg.value = `导入失败：${e.message}`
    }
    evt.target.value = ''
  }
  reader.readAsText(f, 'utf-8')
}

function onClear() {
  if (window.confirm('确定清空全部学习记录？该操作不可恢复（个人记录仅保存在本浏览器）。')) {
    history.clearAll()
    importMsg.value = ''
  }
}

function fmt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <div class="history-view">
    <div class="head">
      <div>
        <h2 class="page-title">学习记录</h2>
        <p class="page-sub">问答历史仅保存在当前浏览器（需求 F07）；清理浏览器数据可能导致记录丢失。</p>
      </div>
      <div class="actions">
        <button class="btn btn-ghost" @click="onExport">导出 JSON</button>
        <button class="btn btn-ghost" @click="importInput?.click()">导入 JSON</button>
        <input ref="importInput" type="file" accept=".json,application/json" class="hidden" @change="onImportFile" />
        <button class="btn btn-danger" @click="onClear">清空全部</button>
      </div>
    </div>

    <div v-if="importMsg" class="import-msg">{{ importMsg }}</div>

    <div v-if="history.sessions.length === 0" class="empty-state">
      <p class="empty-title">还没有学习记录</p>
      <p class="empty-sub">去「知识问答」发起一次提问，会话会自动保存在这里。</p>
    </div>

    <div v-else class="session-list">
      <div v-for="s in history.sessions" :key="s.session_id" class="card session-card">
        <div class="session-head" @click="toggle(s.session_id)">
          <MatchTypeBadge :type="s.match_type" />
          <span class="session-title">{{ s.title }}</span>
          <span class="session-meta">
            {{ modeLabel[s.mode] || s.mode }} · {{ s.messages.length }} 条消息
          </span>
          <span class="session-time">{{ fmt(s.updated_at) }}</span>
          <span class="caret" :class="{ open: expandedId === s.session_id }">▾</span>
        </div>

        <div v-if="expandedId === s.session_id" class="session-detail">
          <p v-if="s.question_stem" class="detail-stem">题目：{{ s.question_stem }}</p>
          <p v-if="s.answer_attempt?.user_answer" class="detail-answer">
            我的理解：{{ s.answer_attempt.user_answer }}
          </p>
          <div v-for="m in s.messages" :key="m.message_id" class="detail-msg" :class="m.role">
            <span class="role-tag">{{ m.role === 'user' ? '我' : 'AI' }}</span>
            <span class="msg-content">{{ m.content }}</span>
          </div>
          <button class="btn btn-primary btn-sm" @click="resume(s)">继续答疑</button>
          <button class="btn btn-ghost btn-sm" @click="history.removeSession(s.session_id)">删除此条</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-view {
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
.btn-ghost:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.btn-danger {
  color: var(--c-danger);
  border-color: #f3c1c1;
}
.btn-danger:hover {
  background: var(--c-danger-bg);
}
.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
  margin-top: 10px;
}
.hidden {
  display: none;
}
.import-msg {
  font-size: 13px;
  color: var(--c-primary);
  background: var(--c-primary-soft);
  border: 1px solid #c6d8ff;
  border-radius: 8px;
  padding: 8px 12px;
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
}
.session-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card {
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}
.session-card {
  overflow: hidden;
}
.session-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  flex-wrap: wrap;
}
.session-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text);
  flex: 1;
  min-width: 160px;
}
.session-meta {
  font-size: 12px;
  color: var(--c-text-3);
}
.session-time {
  font-size: 12px;
  color: var(--c-text-3);
}
.caret {
  color: var(--c-text-3);
  transition: transform 0.15s;
}
.caret.open {
  transform: rotate(180deg);
}
.session-detail {
  border-top: 1px solid var(--c-border);
  padding: 14px 16px;
  background: var(--c-bg);
}
.detail-stem,
.detail-answer {
  font-size: 13px;
  color: var(--c-text-2);
  margin: 0 0 8px;
  line-height: 1.7;
}
.detail-answer {
  color: var(--c-primary);
}
.detail-msg {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  line-height: 1.7;
}
.role-tag {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--c-text-2);
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: 4px;
  padding: 1px 6px;
  height: fit-content;
  margin-top: 2px;
}
.detail-msg.user .msg-content {
  color: var(--c-text);
}
.detail-msg.assistant .msg-content {
  color: var(--c-text-2);
}
</style>
