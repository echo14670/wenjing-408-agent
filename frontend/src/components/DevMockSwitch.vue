<script setup>
import { ref } from 'vue'
import { useMockStore } from '../store/mock'

const mockStore = useMockStore()
const open = ref(false)

const options = [
  { value: 'backend', label: '真实后端（默认）', desc: '连接本地或配置的后端服务；失败如实提示，不补演示数据' },
  { value: 'apifox', label: 'Apifox Mock（占位）', desc: '请求团队约定地址，验证管线；返回值为占位假数据' },
  { value: 'original', label: '演示样例 · 原题', desc: '题库命中：展示核验解析 + 追问（非真实题库）' },
  { value: 'similar', label: '演示样例 · 相似题', desc: '候选仅供参考，答疑针对用户自己的题目' },
  { value: 'miss', label: '演示样例 · 未命中', desc: 'AI 解题分支：结合题干与资料' }
]

function pick(value) {
  mockStore.setMode(value)
  open.value = false
}
</script>

<template>
  <div class="dev-switch" :class="{ open }">
    <button class="fab" @click="open = !open" title="Mock 联调开关">
      {{ open ? '✕' : '⚙' }}
    </button>
    <Transition name="pop">
      <div v-if="open" class="panel">
        <div class="panel-title">Mock 联调（仅显式演示 · 默认不使用）</div>
        <button
          v-for="opt in options"
          :key="opt.value"
          class="opt"
          :class="{ active: mockStore.mode === opt.value }"
          @click="pick(opt.value)"
        >
          <span class="opt-label">{{ opt.label }}</span>
          <span class="opt-desc">{{ opt.desc }}</span>
        </button>
        <div class="panel-note">
          默认走「真实后端」；只有主动选择演示样例才会使用本地数据，且侧栏会显示「演示数据」标。
          接口失败时如实报错，不会静默替换成样例冒充成功。Apifox 为智能 Mock 占位值，仅用于验证请求管线。
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dev-switch {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.fab {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: var(--c-sidebar);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(16, 24, 40, 0.25);
}
.panel {
  width: 300px;
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(16, 24, 40, 0.14);
  padding: 14px;
  margin-bottom: 10px;
}
.panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text);
  margin-bottom: 10px;
}
.opt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid var(--c-border);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.opt:hover {
  border-color: var(--c-primary);
}
.opt.active {
  border-color: var(--c-primary);
  background: var(--c-primary-soft);
}
.opt-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
}
.opt-desc {
  font-size: 12px;
  color: var(--c-text-3);
}
.panel-note {
  font-size: 11px;
  color: var(--c-text-3);
  line-height: 1.6;
  border-top: 1px dashed var(--c-border);
  padding-top: 8px;
  margin-top: 4px;
}
.pop-enter-active, .pop-leave-active { transition: opacity 0.18s, transform 0.18s; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(6px); }
</style>
