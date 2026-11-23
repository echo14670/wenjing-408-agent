import { defineStore } from 'pinia'
import { searchQuestion } from '../api/search'
import { isCanceled } from '../api/errors'

/**
 * 当前检索结果状态（SearchView 写入，ResultView 消费）
 * 结果页按 match_type 三态渲染，数据来源标注 source（apifox-mock / local-demo），避免把演示数据误当真题库。
 * 取消（用户重新提交/离开页面）不算失败：不写入 error，由调用方直接忽略。
 */
export const useSearchStore = defineStore('search', {
  state: () => ({
    query: null, // { raw_input, input_type, year, question_no, user_understanding, subject }
    result: null, // { match_type, question_data, similar_questions, source }
    resultSessionId: null,
    loading: false,
    error: null,
    searchedAt: null
  }),

  getters: {
    matchType(state) {
      return state.result?.match_type || null
    }
  },

  actions: {
    async runSearch(payload, { mock, signal, sessionId = null } = {}) {
      this.loading = true
      this.error = null
      this.query = payload
      this.result = null
      this.resultSessionId = null
      this.searchedAt = null
      const activeQuery = this.query
      try {
        const result = await searchQuestion(
          { raw_input: payload.raw_input, input_type: payload.input_type },
          { mock, signal }
        )
        if (this.query === activeQuery) this.setResult(result, payload, sessionId)
        return result
      } catch (error) {
        if (this.query === activeQuery && !isCanceled(error)) this.error = error.message
        throw error
      } finally {
        if (this.query === activeQuery) this.loading = false
      }
    },

    setResult(result, query = null, sessionId = null) {
      this.result = result
      this.query = query || this.query
      this.resultSessionId = sessionId
      this.searchedAt = new Date().toISOString()
      this.error = null
    },

    clear() {
      this.query = null
      this.result = null
      this.resultSessionId = null
      this.loading = false
      this.error = null
      this.searchedAt = null
    }
  }
})
