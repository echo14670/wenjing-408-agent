/**
 * localStorage key 统一前缀 + 版本号。
 * 采用「前缀 + 版本」双保险：升级时可新旧共存，也便于一次清空。
 */
export const STORAGE_VERSION = 1
export const STORAGE_PREFIX = `wj:v${STORAGE_VERSION}`
export const STORAGE_KEYS = {
  /** 会话索引数组（轻量，供列表渲染） */
  historyIndex: `${STORAGE_PREFIX}:history:index`,
  /** 单会话详情前缀，实际 key 为 <prefix><id> */
  historySessionPrefix: `${STORAGE_PREFIX}:history:s:`,
  /** 用户偏好：默认模式、右栏折叠等 */
  settings: `${STORAGE_PREFIX}:settings`,
  /** 开发态场景选择 */
  mockScenario: `${STORAGE_PREFIX}:mock:scenario`,
  /** 本地个人资料（切片结果） */
  materials: `${STORAGE_PREFIX}:materials`,
  /** 版本标记 */
  meta: `wj:meta:version`
}
/** 滚动位置用 sessionStorage，关掉标签页即失效，无需版本前缀 */
export const SCROLL_KEY_PREFIX = 'wj:scroll:'
