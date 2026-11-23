/** 新答疑界面的历史适配层，统一写入 history:v1。 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useHistoryStore } from './history'
import { isStorageAvailable } from '@/utils/wjStorage'
import { historyView as view } from '@/utils/historyExchange'
export const useWjHistoryStore = defineStore('wjHistory', () => {
  const base = useHistoryStore()
  const reloadedNotice = ref(false)
  const index = computed(() => base.sessions.map(view))
  const current = computed(() => view(base.currentSession))
  const storageOk = computed(() => isStorageAvailable())
  function load() { /* 数据由共享 store 读取；这里不另建一份历史。 */ }
  function getSession(id) { return view(base.sessions.find(s => s.session_id === id)) }
  function findByQuestion(stem, mode) {
    return view(base.sessions.find(s => s.question_stem === stem && (!mode || s.mode === mode)))
  }
  function setCurrent(record) { base.setCurrent(record?.id ?? null) }
  function upsert(input) {
    return view(base.upsertSession(input))
  }
  function markReferenceExposed(exposed) {
    if (exposed && base.currentSession) base.revealAnswer(base.currentSessionId)
  }
  return { index, current, storageOk, reloadedNotice, degradation: 'none',
    hasHistory: computed(() => index.value.length > 0), load, getSession, findByQuestion,
    upsert, setCurrent, markReferenceExposed, flush: () => base.persist(),
    remove: id => base.removeSession(id), clear: () => base.clearAll(), exportJSON: () => base.exportJSON() }
})
