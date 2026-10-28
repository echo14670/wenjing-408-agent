<script setup>
import { useMaterialsStore } from '../store/materials'

/**
 * MaterialsStub —— 我的资料（占位简版）
 * 完整「资料库」页面（条目预览 / 核验状态 / 检索）由负责资料模块的成员开发。
 * 此处仅提供个人资料导入结果与切片预览，用于演示「前端无状态切片 → context_chunks」链路（郑志銮核心逻辑 #3）。
 */

const materials = useMaterialsStore()
</script>

<template>
  <div class="materials-view">
    <div class="head">
      <div>
        <h2 class="page-title">我的资料</h2>
        <p class="page-sub">
          本页为联调占位简版：展示已导入的个人资料及其切片结果（context_chunks）。
          完整资料库页面（条目预览、核验状态、结构化知识条目）由对应模块成员开发。
        </p>
      </div>
      <button v-if="materials.items.length" class="btn btn-ghost" @click="materials.clearAll()">清空资料库</button>
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
      <p class="empty-sub">在「知识问答 → 上传题图」中勾选“保存到个人资料库”，或等待资料导入模块接入。</p>
    </div>

    <div v-else class="mat-list">
      <div v-for="m in materials.items" :key="m.material_id" class="card mat-card">
        <div class="mat-head">
          <span class="mat-title">{{ m.title }}</span>
          <span class="mat-meta">{{ m.chunks.length }} 块 · {{ new Date(m.created_at).toLocaleString('zh-CN', { hour12: false }) }}</span>
          <button class="btn btn-ghost btn-sm" @click="materials.removeMaterial(m.material_id)">删除</button>
        </div>
        <div class="chunk-list">
          <div v-for="c in m.chunks.slice(0, 3)" :key="c.chunk_id" class="chunk">
            <span class="chunk-no">#{{ c.order }}</span>
            <span class="chunk-text">{{ c.text }}</span>
          </div>
          <div v-if="m.chunks.length > 3" class="chunk-more">… 共 {{ m.chunks.length }} 块（超出部分在请求时按需截取）</div>
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
  max-width: 640px;
  line-height: 1.7;
}
.btn {
  border: 1px solid var(--c-border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  padding: 8px 14px;
  background: var(--c-card);
  color: var(--c-text);
}
.btn-ghost:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
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
.card {
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
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
}
.mat-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text);
  flex: 1;
}
.mat-meta {
  font-size: 12px;
  color: var(--c-text-3);
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
.chunk-more {
  font-size: 12px;
  color: var(--c-text-3);
}
</style>
