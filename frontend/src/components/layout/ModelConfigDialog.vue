<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { healthState, modelStatusLabel, refreshHealth } from '@/api/health'
import {
  loadModelCatalog, modelConfigState, refreshModelProfiles, saveModelProfile,
  selectedModel, selectModel, testModelProfile
} from '@/api/modelConfig'

defineProps({ workbench: Boolean })
const emit = defineEmits(['close'])
const dialog = ref(null)
const busy = ref('')
const notice = ref('')
const failed = ref(false)
const catalog = ref([])
const form = reactive({})
const defaultAddresses = {
  deepseek: 'https://api.deepseek.com',
  ollama: 'http://127.0.0.1:11434/v1',
  studio: 'http://127.0.0.1:1234/v1'
}

function openEditor(profile = null) {
  Object.assign(form, {
    id: profile?.id ?? '',
    kind: profile?.kind ?? 'remote',
    name: profile?.name ?? '',
    baseUrl: profile?.base_url ?? '',
    model: profile?.model ?? '',
    savedKey: profile?.has_key ?? false,
    originalUrl: profile?.base_url ?? '',
    originalKind: profile?.kind ?? '',
    key: ''
  })
  notice.value = ''
  failed.value = false
  catalog.value = []
}

openEditor(selectedModel.value)
onMounted(() => {
  dialog.value.showModal()
  void refreshModelProfiles()
})

function close() {
  if (!busy.value) dialog.value.close()
}

function changeKind(kind) {
  if (form.kind === kind) return
  form.kind = kind
  form.key = ''
  form.baseUrl = kind === 'local' ? defaultAddresses.ollama : ''
  form.model = ''
}

function usePreset(name) {
  if (name) form.baseUrl = defaultAddresses[name]
}

function providerOrigin(address) {
  try {
    return new URL(address).origin
  } catch {
    return ''
  }
}

watch(() => form.baseUrl, (current, previous) => {
  if (providerOrigin(current) !== providerOrigin(previous)) form.key = ''
}, { flush: 'sync' })

const keyOnFile = computed(() =>
  form.savedKey && form.kind === form.originalKind && form.baseUrl.trim().replace(/\/+$/, '') === form.originalUrl
)
const canConnect = computed(() => Boolean(form.baseUrl.trim() &&
  (form.kind === 'local' || keyOnFile.value || form.key.trim())
))
const canSave = computed(() => canConnect.value && Boolean(form.model.trim()))

watch(() => [form.kind, form.baseUrl, form.key], () => { catalog.value = [] })
watch(() => [form.kind, form.name, form.baseUrl, form.model, form.key], () => {
  notice.value = ''
  failed.value = false
})

function connection() {
  return { id: form.id || null, kind: form.kind, base_url: form.baseUrl.trim() }
}

function draft() {
  const model = form.model.trim()
  const name = form.name.trim() || Array.from(model).slice(0, 80).join('')
  return { ...connection(), name, model }
}

async function perform(action) {
  failed.value = false
  notice.value = ''
  busy.value = action
  try {
    if (action === 'catalog') {
      const response = await loadModelCatalog(connection(), form.key.trim())
      catalog.value = response.models
      notice.value = catalog.value.length ? '请选择一个模型，或手动输入模型 ID。' : '此服务未列出模型，可手动输入模型 ID。'
    } else if (action === 'test') {
      await testModelProfile(draft(), form.key.trim())
      notice.value = '连接成功，模型已返回测试回复。'
    } else {
      const profile = await saveModelProfile(draft(), form.key.trim())
      openEditor(profile)
      await nextTick()
      notice.value = '已保存并启用。下一条答疑将使用此模型。'
    }
  } catch (error) {
    failed.value = true
    notice.value = error.message || '请求失败，请稍后重试。'
  } finally {
    busy.value = ''
  }
}

function refreshStatus() {
  void refreshHealth({ force: true })
  void refreshModelProfiles()
}

function useSaved(id) {
  selectModel(id)
  failed.value = false
  notice.value = '已切换。下一条答疑将使用当前模型。'
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="model-dialog" :class="{ 'model-workbench': workbench }" aria-labelledby="model-heading"
      @close="emit('close')" @cancel="busy && $event.preventDefault()">
      <header class="model-head">
        <div>
          <h2 id="model-heading">模型配置</h2>
          <p>选择答疑使用的模型，支持远程兼容 API 和本机模型服务。</p>
        </div>
        <button class="model-close" type="button" aria-label="关闭模型配置" :disabled="!!busy" @click="close">×</button>
      </header>
      <div v-if="modelConfigState.status === 'loading'" class="model-status" role="status">正在读取模型配置…</div>
      <div v-else-if="modelConfigState.status === 'disabled'" class="model-status">
        <b>{{ modelStatusLabel(healthState) }}</b>
        <p>此部署由服务端管理模型。在后端配置后可刷新状态。</p>
        <div class="model-footer">
          <button type="button" class="model-button" @click="refreshStatus">刷新状态</button>
        </div>
      </div>
      <div v-else-if="modelConfigState.status === 'error'" class="model-status">
        <p role="alert">暂时无法读取模型配置。</p>
        <p v-if="notice" role="status">{{ notice }}</p>
        <div class="model-footer">
          <button v-if="modelConfigState.selectedId" type="button" class="model-button" @click="useSaved('')">使用后端默认</button>
          <button type="button" class="model-button" @click="refreshModelProfiles">重试</button>
        </div>
      </div>
      <div v-else class="model-layout">
        <aside class="model-list" aria-label="已保存模型">
          <div class="model-list-head">
            <h3>已保存模型</h3>
            <button type="button" class="model-text-button" :disabled="!!busy" @click="openEditor()">＋ 添加</button>
          </div>
          <div class="model-card" :class="{ 'model-active': !modelConfigState.selectedId }">
            <div>
              <strong>后端默认</strong>
              <span class="model-id">{{ healthState.model || modelStatusLabel(healthState) }}</span>
            </div>
            <span v-if="!modelConfigState.selectedId" class="model-current">当前使用</span>
            <button v-else type="button" class="model-text-button" :disabled="!!busy" @click="useSaved('')">使用</button>
          </div>
          <div v-for="profile in modelConfigState.profiles" :key="profile.id" class="model-card"
            :class="{ 'model-active': modelConfigState.selectedId === profile.id }">
            <div>
              <strong>{{ profile.name }}</strong>
              <span class="model-id">{{ profile.model }}</span>
              <span class="model-kind">{{ profile.kind === 'local' ? '本地模型' : '远程 API' }}</span>
            </div>
            <div class="model-card-actions">
              <span v-if="modelConfigState.selectedId === profile.id" class="model-current">当前使用</span>
              <button v-else type="button" class="model-text-button" :disabled="!!busy" @click="useSaved(profile.id)">使用</button>
              <button type="button" class="model-text-button" :disabled="!!busy" @click="openEditor(profile)">编辑</button>
            </div>
          </div>
        </aside>

        <form class="model-editor" @submit.prevent="perform('save')">
          <h3>{{ form.id ? '编辑模型' : '添加模型' }}</h3>
          <fieldset class="model-fields" :disabled="!!busy">
            <div class="model-tabs" role="group" aria-label="连接方式">
              <button type="button" :aria-pressed="form.kind === 'remote'" @click="changeKind('remote')">远程 API</button>
              <button type="button" :aria-pressed="form.kind === 'local'" @click="changeKind('local')">本地模型</button>
            </div>
            <div class="model-cols">
              <label>
                <span>名称</span>
                <input v-model="form.name" maxlength="80" :placeholder="form.kind === 'local' ? '例如 本机 Qwen' : '例如 DeepSeek'">
              </label>
              <label>
                <span>常用地址</span>
                <select :key="form.kind" @change="usePreset($event.target.value); $event.target.value = ''">
                  <option value="">手动填写</option>
                  <option v-if="form.kind === 'remote'" value="deepseek">DeepSeek</option>
                  <template v-else>
                    <option value="ollama">Ollama</option>
                    <option value="studio">LM Studio</option>
                  </template>
                </select>
              </label>
            </div>
            <label>
              <span>API 地址</span>
              <input v-model="form.baseUrl" type="url" maxlength="2048" required spellcheck="false"
                :placeholder="form.kind === 'local' ? 'http://127.0.0.1:11434/v1' : 'https://api.example.com/v1'">
              <small>{{ form.kind === 'local' ? '由本机模型服务提供，通常以 /v1 结尾。' : '填写 OpenAI 兼容的 HTTPS API 地址。' }}</small>
            </label>
            <label>
              <span>API 密钥 <small v-if="form.kind === 'local'">可选</small></span>
              <input v-model="form.key" type="password" autocomplete="off" spellcheck="false"
                :placeholder="keyOnFile ? '已保存，留空沿用' : (form.kind === 'local' ? '服务要求密钥时填写' : '输入服务商提供的密钥')">
            </label>
            <div class="model-picker">
              <label>
                <span>模型 ID</span>
                <input v-model="form.model" maxlength="200" required spellcheck="false" placeholder="手动输入或从目录选择">
              </label>
              <button class="model-button" type="button" :disabled="!canConnect" @click="perform('catalog')">获取可用模型</button>
            </div>
            <label v-if="catalog.length">
              <span>可用模型</span>
              <select :value="form.model" @change="form.model = $event.target.value">
                <option value="">从目录选择</option>
                <option v-for="model in catalog" :key="model" :value="model">{{ model }}</option>
              </select>
            </label>
          </fieldset>
          <p v-if="busy" class="model-notice" role="status">
            {{ { catalog: '正在读取模型目录…', test: '正在等待模型回复…', save: '正在保存…' }[busy] }}
          </p>
          <p v-else-if="notice" class="model-notice" :class="{ 'model-error': failed }" :role="failed ? 'alert' : 'status'">{{ notice }}</p>
          <div class="model-footer">
            <button class="model-button" type="button" :disabled="!!busy || !canSave" @click="perform('test')">测试连接</button>
            <button class="model-button model-primary" type="submit" :disabled="!!busy || !canSave">保存并使用</button>
          </div>
        </form>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.model-dialog {
  --panel: #172337;
  --surface: #202e44;
  --field: #101a2a;
  --line: #384962;
  --text: #eef4ff;
  --muted: #b1c1d9;
  --accent: #8eafff;
  --hover: #2c3e5b;
  --active: #304465;
  --action: #a9c2ff;
  --action-hover: #c2d4ff;
  --action-text: #17233c;
  --button-line: #516888;
  --active-line: #607fc0;
  --placeholder: #879ab6;
  --success: #a8e8d7;
  --error: #ffc4a8;
  width: min(830px, calc(100vw - 28px));
  max-height: calc(100dvh - 28px);
  margin: auto;
  padding: 0;
  overflow: auto;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 15px;
  box-shadow: 0 18px 65px #03091488;
  color-scheme: dark;
  font: 14px/1.55 system-ui, "Microsoft YaHei", sans-serif;
}
.model-dialog::backdrop { background: #0911229c; }
.model-workbench {
  --panel: #fff;
  --surface: #f6f8fc;
  --field: #f8faff;
  --line: #dfe4ed;
  --text: #202124;
  --muted: #4e5868;
  --accent: #2858a0;
  --hover: #edf2fa;
  --active: #e7effd;
  --action: #2858a0;
  --action-hover: #1b417e;
  --action-text: #fff;
  --button-line: #c5cfde;
  --active-line: #577dbb;
  --placeholder: #626d7e;
  --success: #2c634d;
  --error: #922e22;
  color-scheme: light;
  box-shadow: 0 18px 65px #26395428;
}
.model-workbench::backdrop { background: #24324a62; }
.model-dialog h2, .model-dialog h3, .model-dialog p { margin: 0; }
.model-dialog button, .model-dialog input, .model-dialog select { font: inherit; }
.model-dialog button { cursor: pointer; }
.model-dialog button:disabled { opacity: .55; cursor: default; }
.model-dialog button:focus-visible, .model-dialog input:focus-visible, .model-dialog select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.model-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 14px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--line);
}
.model-head h2 { font-size: 21px; font-weight: 700; }
.model-head p { margin-top: 4px; color: var(--muted); }
.model-close {
  width: 32px;
  height: 32px;
  flex: none;
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 22px !important;
  line-height: 1 !important;
}
.model-status { padding: 20px 24px 26px; }
.model-status p { margin-top: 8px; color: var(--muted); }
.model-layout { display: grid; grid-template-columns: minmax(215px, 31%) minmax(0, 1fr); }
.model-list { min-width: 0; padding: 16px 14px 18px 20px; border-right: 1px solid var(--line); }
.model-list-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.model-list h3, .model-editor h3 { font-size: 15px; }
.model-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 7px;
  padding: 9px;
  margin-bottom: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}
.model-card strong, .model-id, .model-kind { display: block; overflow-wrap: anywhere; }
.model-card strong { font-size: 13px; }
.model-id, .model-kind { margin-top: 3px; color: var(--muted); font-size: 11px; }
.model-active { border-color: var(--active-line); }
.model-current { color: var(--success); font-size: 11px; white-space: nowrap; }
.model-card-actions { display: grid; justify-items: end; gap: 3px; }
.model-text-button { padding: 0; color: var(--accent); background: transparent; border: 0; font-size: 12px !important; }
.model-text-button:hover:not(:disabled) { text-decoration: underline; }
.model-editor { min-width: 0; padding: 16px 22px 20px 18px; }
.model-fields { display: grid; gap: 12px; min-inline-size: 0; margin: 11px 0 0; border: 0; padding: 0; }
.model-tabs { display: inline-flex; gap: 4px; padding: 4px; background: var(--field); border-radius: 8px; justify-self: start; }
.model-tabs button { padding: 6px 14px; background: transparent; border: 0; color: var(--muted); border-radius: 6px; }
.model-tabs button[aria-pressed="true"] { background: var(--active); color: var(--text); }
.model-cols { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.model-fields label { display: grid; min-width: 0; gap: 5px; color: var(--text); }
.model-fields small { color: var(--muted); font-size: 11px; font-weight: 400; }
.model-fields input, .model-fields select {
  min-height: 36px;
  width: 100%;
  padding: 6px 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--text);
  background: var(--field);
  box-sizing: border-box;
}
.model-fields input::placeholder { color: var(--placeholder); }
.model-picker { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 8px; }
.model-button {
  min-height: 36px;
  padding: 5px 10px;
  border: 1px solid var(--button-line);
  border-radius: 7px;
  color: var(--text);
  background: var(--surface);
  white-space: nowrap;
}
.model-button:hover:not(:disabled), .model-close:hover:not(:disabled) { background: var(--hover); }
.model-primary { background: var(--action); color: var(--action-text); border-color: var(--action); font-weight: 680 !important; }
.model-primary:hover:not(:disabled) { background: var(--action-hover); }
.model-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 15px; }
.model-editor .model-notice { margin-top: 10px; color: var(--success); font-size: 12px; }
.model-editor .model-error { color: var(--error); }
@media (max-width: 620px) {
  .model-head { padding: 14px; }
  .model-layout { grid-template-columns: minmax(0, 1fr); }
  .model-list { padding: 13px 14px 5px; border-right: 0; border-bottom: 1px solid var(--line); }
  .model-editor { padding: 12px 14px 16px; }
  .model-picker { grid-template-columns: minmax(0, 1fr) auto; }
  .model-picker .model-button { padding-inline: 7px; font-size: 12px; }
}
</style>
