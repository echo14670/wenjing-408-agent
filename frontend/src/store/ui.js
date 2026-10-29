/** 全局 UI 状态：Toast、开发面板场景、侧栏折叠 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { persistScenario, resolveScenario } from '@/mock/scenarios'
import { uid } from '@/utils/id'
export const useUiStore = defineStore('ui', () => {
  const toasts = ref([])
  const scenario = ref('auto')
  const scenarioInited = ref(false)
  function toast(text, tone = 'info', duration = 3200) {
    const item = { id: uid('t'), text, tone }
    toasts.value.push(item)
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== item.id)
    }, duration)
  }
  function dismiss(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }
  function initScenario(queryValue) {
    if (!scenarioInited.value) {
      scenario.value = resolveScenario(queryValue)
      scenarioInited.value = true
    } else if (queryValue) {
      scenario.value = resolveScenario(queryValue, scenario.value)
    }
    return scenario.value
  }
  function setScenario(next) {
    scenario.value = next
    persistScenario(next)
  }
  return { toasts, scenario, initScenario, setScenario, toast, dismiss }
})
