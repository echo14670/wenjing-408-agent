/** 路由名与路径生成，避免字符串散落各处 */
export const ROUTE = {
  entry: 'entry',
  answer: 'answer',
  steps: 'steps',
  teaching: 'teaching',
  notFound: 'not-found'
}
export const PATH = {
  entry: '/',
  answer: '/answer',
  steps: '/steps',
  teaching: '/teaching'
}
export function withQuery(path, query) {
  const clean = {}
  if (query.sid) clean.sid = query.sid
  if (query.q) clean.q = query.q
  if (query.mock) clean.mock = query.mock
  if (query.mode) clean.mode = query.mode
  return { path, query: clean }
}
