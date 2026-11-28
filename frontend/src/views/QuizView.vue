<script setup>
/**
 * 独立小测页（Beta §08）。
 *
 * 入口约定（与黄俊凡 / 龚巍斌对齐）：
 *   /#/quiz                        新建作答
 *   /#/quiz?quiz=co-memory-01      指定题组
 *   /#/quiz?attempt=<attempt_id>   打开原草稿或固定成绩（学习记录点这里）
 * 组件接受 attemptId 并回传 attempt-change，页面负责把 ID 写回 URL，
 * 这样刷新能续答、重做能生成新 ID，学习记录也能按同一 ID 找回。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QuizPanel from '@/components/QuizPanel.vue'
import { useWjQuizStore } from '@/store/wjQuiz'
import { DEFAULT_QUIZ_ID } from '@/utils/quiz'
import { attemptRoute } from '@/constants/routes'
import '@/styles/workbench.css'

const route = useRoute()
const router = useRouter()
const quizStore = useWjQuizStore()
const quizId = computed(() => typeof route.query.quiz === 'string' && route.query.quiz.trim()
  ? route.query.quiz.trim() : DEFAULT_QUIZ_ID)
const attemptId = computed(() => typeof route.query.attempt === 'string' ? route.query.attempt : '')
const attempts = computed(() => quizStore.listAttempts(quizId.value).slice(0, 8))

function onAttemptChange(id) {
  const query = { quiz: quizId.value }
  if (id) query.attempt = id
  if ((route.query.attempt ?? '') === (query.attempt ?? '')) return
  void router.replace({ name: 'quiz', query })
}

function openAttempt(id) {
  void router.push(attemptRoute(id))
}

function backToWorkbench() {
  void router.push({ name: 'workbench', query: {} })
}
</script>

<template>
  <div class="quiz-page">
    <main class="quiz-main">
      <button type="button" class="wb-link quiz-back" @click="backToWorkbench">← 返回学习工作台</button>
      <QuizPanel
        :key="`${quizId}:${attemptId}`"
        :quiz-id="quizId"
        :attempt-id="attemptId"
        @attempt-change="onAttemptChange"
      />

      <section v-if="attempts.length" class="quiz-history">
        <h2>本机作答记录</h2>
        <p class="wb-note">按作答 ID 保存在当前浏览器；未交卷可继续，已交卷可查看当时的成绩。</p>
        <ul class="wb-records">
          <li v-for="item in attempts" :key="item.attemptId">
            <button type="button" class="wb-record" :class="{ 'quiz-record-active': item.attemptId === attemptId }"
              @click="openAttempt(item.attemptId)">
              <span>
                <strong>{{ item.title || '固定题组小测' }}</strong>
                <small>{{ item.status }} · {{ item.detail }} · 版本 {{ item.version }} · {{ item.attemptId }}</small>
              </span>
              <span aria-hidden="true">↗</span>
            </button>
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* 不用 .wb 外壳：那套 grid 会锁死三列并占满视口，独立页用普通文档流。 */
.quiz-page {
  --wb-bg: #fff;
  --wb-paper: #fff;
  --wb-text: #202124;
  --wb-muted: #4e5868;
  --wb-border: #dfe4ed;
  --wb-soft: #f1f4f9;
  --wb-accent: #2858a0;
  --wb-hover: #edf2fa;
  --wb-hover-border: #a7b9d5;
  min-height: 100vh;
  background: var(--wb-bg);
  color: var(--wb-text);
  font-family: "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif;
  font-size: 14px;
}
.quiz-main { width: min(100% - 44px, 880px); margin: 0 auto; padding: 30px 0 60px; }
.quiz-back { margin-bottom: 14px; }
.quiz-history { margin-top: 30px; padding-top: 18px; border-top: 1px solid var(--wb-border); }
.quiz-history h2 { font-size: 15px; margin-bottom: 6px; }
.quiz-record-active { border-color: var(--wb-accent); }
@media (max-width: 420px) { .quiz-main { width: calc(100% - 28px); padding: 20px 0 48px; } }
</style>
