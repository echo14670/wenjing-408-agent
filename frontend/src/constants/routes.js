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
  classic: '/classic',
  result: '/result',
  history: '/history',
  materials: '/materials',
  answer: '/answer',
  steps: '/steps',
  teaching: '/teaching'
}
export function withQuery(path, query) {
  const clean = {}
  for (const key of ['sid', 'q', 'mock', 'mode', 'practice']) {
    const value = query[key]
    if (typeof value === 'string' && value) clean[key] = value
  }
  return { path, query: clean }
}
