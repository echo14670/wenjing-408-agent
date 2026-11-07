/**
 * 同考点练习（切题）状态。
 *
 * 只存"跨组件需要共享的薄状态"：正在切换的锁、上一次切换的审计快照。
 * 题目内容本身仍然放在 session store —— 切题不是开新上下文，而是替换同一份上下文。
 *
 * 为什么不把 lastSwitch 塞进 session：session.reset() 会清掉它，
 * 而"刚切完题、要告诉用户隔离了什么"恰恰发生在这之后。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useWjPracticeStore = defineStore('wjPractice', () => {
  /** 切换中：防止连点两次推荐，产生两条并发请求 */
  const switching = ref(false)
  /** 正在切往哪道题：切题失败时"重试"要重试它，而不是退回关键词检索 */
  const pending = ref(null)
  /** 上一次切题：{ from, to, mode, audit, at } */
  const lastSwitch = ref(null)
  /** 用户是否关掉了隔离说明 */
  const noticeDismissed = ref(false)

  const noticeVisible = computed(() => Boolean(lastSwitch.value) && !noticeDismissed.value)

  function beginSwitch() {
    switching.value = true
  }
  function recordSwitch(payload) {
    lastSwitch.value = { ...payload, at: Date.now() }
    noticeDismissed.value = false
  }
  function completeSwitch(to) {
    if (lastSwitch.value) lastSwitch.value = { ...lastSwitch.value, to }
    switching.value = false
  }
  function failSwitch() {
    switching.value = false
  }
  function dismissNotice() {
    noticeDismissed.value = true
  }
  function reset() {
    switching.value = false
    pending.value = null
    lastSwitch.value = null
    noticeDismissed.value = false
  }

  return {
    switching,
    pending,
    lastSwitch,
    noticeDismissed,
    noticeVisible,
    beginSwitch,
    recordSwitch,
    completeSwitch,
    failSwitch,
    dismissNotice,
    reset
  }
})
