import { createRouter, createWebHashHistory } from 'vue-router'
import SearchView from '../views/SearchView.vue'
import { PATH } from '@/constants/routes'

const routes = [
  {
    path: PATH.entry,
    name: 'workbench',
    component: () => import('../views/WorkbenchView.vue'),
    meta: { title: '学习工作台', workbench: true }
  },
  {
    path: PATH.classic,
    name: 'search',
    component: SearchView,
    meta: { title: '知识问答' }
  },
  {
    path: PATH.result,
    name: 'result',
    component: () => import('../views/ResultView.vue'),
    meta: { title: '检索结果' }
  },
  {
    path: PATH.history,
    name: 'history',
    component: () => import('../views/HistoryView.vue'),
    meta: { title: '学习记录' }
  },
  {
    path: PATH.materials,
    name: 'materials',
    component: () => import('../views/MaterialsView.vue'),
    meta: { title: '我的资料' }
  },

  {
    path: PATH.answer,
    name: 'answer',
    component: () => import('../views/AnswerView.vue'),
    meta: { title: '答案详解', studyScenario: true }
  },
  {
    path: PATH.steps,
    name: 'steps',
    component: () => import('../views/StepsView.vue'),
    meta: { title: '分步导学', studyScenario: true }
  },
  {
    path: PATH.teaching,
    name: 'teaching',
    component: () => import('../views/TeachingView.vue'),
    meta: { title: '教学模式', studyScenario: true }
  },

  { path: '/:pathMatch(.*)*', redirect: PATH.entry }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
