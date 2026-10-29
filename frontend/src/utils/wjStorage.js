/**
 * localStorage 安全封装：版本化 + 容量降级 + 可用性探测。
 *
 * 设计要点：
 * 1. 模块加载时 probe 一次，Safari 隐私模式 / 禁用 Cookie 时整体降级为内存 Map，
 *    上层代码无感知，避免抛异常导致白屏。
 * 2. QuotaExceededError 交给调用方（history）做分级清理，这里只提供 evictOldest 原语。
 * 3. 所有读写失败都不抛错，返回 null / false，让 UI 走降级分支。
 */
import { STORAGE_KEYS, STORAGE_PREFIX, STORAGE_VERSION } from '@/constants/storageKeys'
let memory = null
let available = true
function backendAvailable() {
  try {
    const probeKey = `${STORAGE_PREFIX}:__probe__`
    window.localStorage.setItem(probeKey, '1')
    window.localStorage.removeItem(probeKey)
    return true
  } catch {
    return false
  }
}
/* 探测只在浏览器环境执行一次 */
if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
  available = backendAvailable()
} else {
  available = false
}
if (!available) {
  memory = new Map()
}
/** 存储是否真正可用（不可用时 UI 应灰化「导出历史」等能力） */
export function isStorageAvailable() {
  return available
}
function readRaw(key) {
  if (memory) return memory.get(key) ?? null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeRaw(key, value) {
  if (memory) {
    memory.set(key, value)
    return 'ok'
  }
  try {
    window.localStorage.setItem(key, value)
    return 'ok'
  } catch (err) {
    const name = err?.name ?? ''
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return 'quota'
    return 'blocked'
  }
}
function removeRaw(key) {
  if (memory) {
    memory.delete(key)
    return
  }
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
/** 读 JSON，解析失败视为损坏并清除 */
export function readJSON(key) {
  const raw = readRaw(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    removeRaw(key)
    return null
  }
}
export function writeJSON(key, value) {
  try {
    return writeRaw(key, JSON.stringify(value))
  } catch {
    // 循环引用等序列化异常
    return 'blocked'
  }
}
export function removeKey(key) {
  removeRaw(key)
}
/** 列出所有以 wj: 开头的 key，用于清空 / 孤儿清理 */
export function listKeys() {
  if (memory) return Array.from(memory.keys())
  const keys = []
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith('wj:')) keys.push(k)
    }
  } catch {
    /* ignore */
  }
  return keys
}
export function clearAll() {
  listKeys().forEach(removeKey)
}
/**
 * 版本迁移：当前只支持 v1。
 * 未来升级时在这里按 from → to 逐级迁移，避免用户数据被静默丢弃。
 */
export function ensureVersion() {
  const current = readRaw(STORAGE_KEYS.meta)
  if (current === String(STORAGE_VERSION)) return
  if (current === null) {
    writeRaw(STORAGE_KEYS.meta, String(STORAGE_VERSION))
    return
  }
  // 旧版本数据无法保证结构兼容，清空并重新标记
  listKeys()
    .filter((k) => k !== STORAGE_KEYS.meta)
    .forEach(removeKey)
  writeRaw(STORAGE_KEYS.meta, String(STORAGE_VERSION))
}
