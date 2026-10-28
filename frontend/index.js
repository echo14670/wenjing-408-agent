import { createRouter, createWebHashHistory } from 'vue-router'
import SearchView from '../views/SearchView.vue'

const routes = [
  {
    path: '/',
    name: 'search',
    component: SearchView,
    meta: { title: '知识问答' }
  },
  {
    path: '/result',
    name: 'result',
    component: () => import('../views/ResultView.vue'),
    meta: { title: '检索结果' }
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('../views/HistoryView.vue'),
    meta: { title: '学习记录' }
  },
  {
    path: '/materials',
    name: 'materials',
    component: () => import('../views/MaterialsStub.vue'),
    meta: { title: '我的资料' }
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
