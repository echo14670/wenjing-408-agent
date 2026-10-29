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

  /* ---------- 答疑展示模块（答案 / 步骤 / 教学模式） ----------
   * meta.fullLayout: 这三页自带完整外壳（侧栏 + Toast + 场景面板），
   * 由 App.vue 跳过 app-shell，否则会渲染出双层侧栏。
   */
  {
    path: '/answer',
    name: 'answer',
    component: () => import('../views/AnswerView.vue'),
    meta: { title: '答案详解', fullLayout: true }
  },
  {
    path: '/steps',
    name: 'steps',
    component: () => import('../views/StepsView.vue'),
    meta: { title: '分步导学', fullLayout: true }
  },
  {
    path: '/teaching',
    name: 'teaching',
    component: () => import('../views/TeachingView.vue'),
    meta: { title: '教学模式', fullLayout: true }
  },

  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
