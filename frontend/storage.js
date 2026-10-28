/**
 * localStorage 安全封装：统一前缀、JSON 序列化、异常兜底。
 * 个人资料与学习记录默认只存在当前浏览器（需求 F07：本地保存，支持导入/导出/清空）。
 */

const PREFIX = 'wenjing:'

export function storageKey(name) {
  return PREFIX + name
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(storageKey(key))
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch (e) {
    console.warn(`[storage] 读取 ${key} 失败，使用默认值`, e)
    return fallback
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value))
    return true
  } catch (e) {
    console.warn(`[storage] 写入 ${key} 失败（可能超出配额）`, e)
    return false
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(storageKey(key))
  } catch (e) {
    console.warn(`[storage] 删除 ${key} 失败`, e)
  }
}

/** 生成可下载文件（导出 JSON 用） */
export function downloadText(filename, text, mime = 'application/json;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
