let counter = 0
/** 生成短 id：时间戳 36 进制 + 自增 + 随机后缀，够用且可读 */
export function uid(prefix = '') {
  counter = (counter + 1) % 1000
  const t = Date.now().toString(36)
  const c = counter.toString(36).padStart(2, '0')
  const r = Math.random().toString(36).slice(2, 6)
  return `${prefix}${prefix ? '_' : ''}${t}${c}${r}`
}
