import { defineStore } from 'pinia'
import { DEFAULT_MOCK_MODE } from '../config/mock'
import { loadJSON, saveJSON } from '../utils/storage'

const KEY = 'mock-mode'

/**
 * Mock 联调开关（全局生效）
 *  - 'apifox'：真实请求 Apifox Mock 地址（结构对、值为占位假数据）
 *  - 'original' | 'similar' | 'miss'：使用本地契约样例，保证三态 UI 可稳定演示
 * 默认 local，右上角悬浮面板 DevMockSwitch 可随时切换。
 */
export const useMockStore = defineStore('mock', {
  state: () => ({
    mode: loadJSON(KEY, DEFAULT_MOCK_MODE)
  }),
  actions: {
    setMode(mode) {
      this.mode = mode
      saveJSON(KEY, mode)
    }
  }
})
