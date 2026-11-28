import { createRouter, createWebHashHistory } from 'vue-router'
import { PATH } from '@/constants/routes'

const home = { name: 'workbench', query: {} }

function sessionRedirect({ query: { sid, q, mode, practice } }) {
  return { name: 'workbench', query: { sid, q, mode, practice } }
}

const routes = [
  {
    path: PATH.entry,
    name: 'workbench',
    component: () => import('../views/WorkbenchView.vue'),
    meta: { title: '学习工作台' }
  },
  {
    path: PATH.quiz,
    name: 'quiz',
    component: () => import('../views/QuizView.vue'),
    meta: { title: '三题小测' }
  },
  { path: PATH.history, redirect: { name: 'workbench', query: { view: 'history' } } },
  { path: PATH.materials, redirect: { name: 'workbench', query: { view: 'materials' } } },
  ...[PATH.result, PATH.answer, PATH.steps, PATH.teaching].map(path => ({ path, redirect: sessionRedirect })),
  { path: PATH.classic, redirect: home },
  { path: '/:pathMatch(.*)*', redirect: home }
]

export default createRouter({
  history: createWebHashHistory(),
  routes
})
