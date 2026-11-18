import { computed, reactive, readonly } from 'vue'
import { loadJSON, saveJSON } from '@/utils/storage'
import { request } from './client'
import { API_PATHS } from './paths'

const selectionKey = 'selected-model-profile:v1'
const storedId = loadJSON(selectionKey, '')
const state = reactive({
  status: 'loading',
  profiles: [],
  selectedId: typeof storedId === 'string' ? storedId : ''
})
let pendingList = null

export const modelConfigState = readonly(state)
export const selectedModel = computed(() => state.profiles.find(profile => profile.id === state.selectedId))

export function selectModel(id = '') {
  state.selectedId = id
  saveJSON(selectionKey, id)
}

export function modelProfileHeaders() {
  return state.selectedId ? { 'X-Wenjing-Model-Profile': state.selectedId } : undefined
}

export function refreshModelProfiles() {
  if (pendingList) return pendingList
  state.status = 'loading'
  pendingList = request({ url: API_PATHS.modelConfig, method: 'GET', timeout: 5000 })
    .then((value) => {
      state.profiles = value.profiles || []
      state.status = 'ready'
      if (state.selectedId && !selectedModel.value) selectModel()
    })
    .catch((error) => {
      state.status = error.status === 404 || error.status === 403 ? 'disabled' : 'error'
      if (state.status === 'disabled' && state.selectedId) selectModel()
    })
    .finally(() => { pendingList = null })
  return pendingList
}

function configure(path, data, apiKey, timeout) {
  return request({
    url: path, method: 'POST', data, timeout,
    headers: apiKey ? { 'X-Wenjing-Provider-Key': apiKey } : undefined
  })
}

export async function saveModelProfile(data, apiKey) {
  const profile = await configure(API_PATHS.modelProfiles, data, apiKey, 8000)
  state.profiles = [...state.profiles.filter(item => item.id !== profile.id), profile]
  selectModel(profile.id)
  return profile
}

export function loadModelCatalog(data, apiKey) {
  return configure(API_PATHS.modelCatalog, data, apiKey, 12000)
}

export function testModelProfile(data, apiKey) {
  return configure(API_PATHS.modelTest, data, apiKey, 28000)
}
