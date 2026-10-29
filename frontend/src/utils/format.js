/** 文本/时间格式化 */
export function formatRelativeTime(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts)
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function formatClock(ts) {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function pad(n) {
  return n < 10 ? `0${n}` : String(n)
}
/** 截断并加省略号，用于题干摘要落库 */
export function clip(text, max) {
  const t = (text ?? '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}
/** 位数占比，用于分段条 tooltip */
export function percent(part, total) {
  if (!total) return '0%'
  return `${Math.round((part / total) * 1000) / 10}%`
}
export function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}
