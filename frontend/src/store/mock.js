import { defineStore } from 'pinia'
import { DEFAULT_MOCK_MODE } from '../config/mock'
import { loadJSON, saveJSON } from '../utils/storage'

const KEY = 'mock-mode'

/** 允许的联调模式；未知值一律回落默认，避免 localStorage 残留把默认路径带到演示数据 */
export const MOCK_MODES = ['backend', 'apifox', 'local', 'original', 'similar', 'miss']

/** 真正的本地演示数据模式（只有显式选择才生效，默认路径不经过 mock） */
export const DEMO_MODES = ['local', 'original', 'similar', 'miss']

export function isDemoMode(mode) {
  return DEMO_MODES.includes(mode)
}

function initialMode() {
  // 线上版本不显示开关，也忽略浏览器里残留的旧选择，固定连接真实后端。
  if (!import.meta.env.DEV) return DEFAULT_MOCK_MODE
  const stored = loadJSON(KEY, DEFAULT_MOCK_MODE)
  return MOCK_MODES.includes(stored) ? stored : DEFAULT_MOCK_MODE
}

/**
 * Mock 联调开关（全局生效，仅开发态可用）
 *  - 'backend'（默认）：真实后端；接口失败就如实报错，不补演示数据
 *  - 'apifox'：真实请求 Apifox Mock 地址（验证管线，返回占位假数据）
 *  - 'original' | 'similar' | 'miss' | 'local'：显式演示数据，界面会打“演示数据”标
 * 只有用户在 DevMockSwitch 里主动选择，演示数据才会生效；不允许 404/5xx 静默替换。
 */
export const useMockStore = defineStore('mock', {
  state: () => ({
    mode: initialMode()
  }),
  actions: {
    setMode(mode) {
      if (!MOCK_MODES.includes(mode)) return
      this.mode = mode
      saveJSON(KEY, mode)
    }
  }
})
