import { defineStore } from 'pinia'
import { searchQuestion } from '../api/search'

/**
 * 当前检索结果状态（SearchView 写入，ResultView 消费）
 * 结果页按 match_type 三态渲染，数据来源标注 source（apifox-mock / local-demo），避免把演示数据误当真题库。
 */
export const useSearchStore = defineStore('search', {
  state: () => ({
    query: null, // { raw_input, input_type, year, question_no, user_understanding, subject }
    result: null, // { match_type, question_data, similar_questions, source }
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
    async runSearch(payload, { mock } = {}) {
      this.loading = true
      this.error = null
      this.query = payload
      try {
        const result = await searchQuestion(
          { raw_input: payload.raw_input, input_type: payload.input_type },
          { mock }
        )
        this.result = result
        this.searchedAt = new Date().toISOString()
        return result
      } catch (e) {
        this.error = e.message
        this.result = null
        throw e
      } finally {
        this.loading = false
      }
    },

    setResult(result, query = null) {
      this.result = result
      this.query = query || this.query
      this.searchedAt = new Date().toISOString()
      this.error = null
    },

    clear() {
      this.query = null
      this.result = null
      this.loading = false
      this.error = null
      this.searchedAt = null
    }
  }
})
