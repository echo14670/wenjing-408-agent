<script setup>
/**
 * AnswerPanel —— 答案/步骤/教学模式展示（集成边界）
 *
 * 【协作说明】本组件属于 王翔鹏 负责的「答案/步骤/教学模式展示」范围。
 * 郑志銮 为保证输入/搜索/结果页可端到端演示，先提供基础可用实现：
 *   - 消息流渲染（user/assistant）、tool_result、citations 展示
 *   - 直接讲解 / 引导学习 两种模式的基础差异（引导不泄底提示）
 *   - 冲突展示占位（红线 #1：模型与原答案冲突须同屏展示差异）
 * 后续由 王翔鹏 在此组件内深化：分步步骤卡、教学模式交互、冲突 Diff 视图等。
 * 对外接口保持不变：props.sessionId，读取 history store 的会话与消息。
 */
import { ref, computed } from 'vue'
import { useHistoryStore } from '../store/history'
import { useMaterialsStore } from '../store/materials'
import { chatRequest } from '../api/chat'

const props = defineProps({
  sessionId: { type: String, required: true }
})

const history = useHistoryStore()
const materials = useMaterialsStore()

const draft = ref('')
const sending = ref(false)
const error = ref('')

const session = computed(() => history.sessions.find((s) => s.session_id === props.sessionId) || null)
const messages = computed(() => session.value?.messages || [])
const mode = computed(() => session.value?.mode || 'direct')
const isGuided = computed(() => mode.value === 'guided')

const modeLabel = { direct: '直接讲解', guided: '引导学习' }

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value || !session.value) return
  error.value = ''
  sending.value = true
  try {
    history.appendMessage(props.sessionId, { role: 'user', content: text })
    const payload = {
      session_messages: history.messagesForSession(props.sessionId),
      question_id: session.value.match_type === 'original' ? session.value.question_id : null,
      user_answer: session.value.answer_attempt?.user_answer || '',
      mode: mode.value,
      context_chunks: materials.contextChunks
    }
    const res = await chatRequest(payload)
    history.appendMessage(props.sessionId, {
      role: 'assistant',
      content: res.reply,
      model_source: res.source
    })
    // 工具结果与引用随最后一条助手消息展示：记录在会话的最近工具调用上
    const last = history.sessions.find((s) => s.session_id === props.sessionId).messages.at(-1)
    last.tool_result = res.tool_result || ''
    last.citations = res.citations || []
    history.persist()
    if (draft.value.trim() === text) draft.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    sending.value = false
  }
}

async function revealAndAsk() {
  if (sending.value || !session.value) return
  history.revealAnswer(props.sessionId)
  draft.value = '我选择查看这道题的完整答案与解析。'
  await send()
}

/** 失败重试：不重复追加用户消息，直接按当前完整消息序列重发 */
async function retry() {
  if (sending.value || !session.value) return
  const last = [...messages.value].reverse().find((m) => m.role === 'user')
  if (!last) return
  error.value = ''
  sending.value = true
  try {
    const res = await chatRequest({
      session_messages: history.messagesForSession(props.sessionId),
      question_id: session.value.match_type === 'original' ? session.value.question_id : null,
      user_answer: session.value.answer_attempt?.user_answer || '',
      mode: mode.value,
      context_chunks: materials.contextChunks
    })
    history.appendMessage(props.sessionId, {
      role: 'assistant',
      content: res.reply,
      model_source: res.source
    })
    const lastMsg = history.sessions.find((s) => s.session_id === props.sessionId).messages.at(-1)
    lastMsg.tool_result = res.tool_result || ''
    lastMsg.citations = res.citations || []
    history.persist()
    if (draft.value.trim() === last.content) draft.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div v-if="session" class="answer-panel">
    <div class="panel-head">
      <span class="mode-chip">{{ modeLabel[mode] }}</span>
      <span v-if="isGuided" class="guided-note">引导模式下，初始回复仅提供分步提示，不直接展示最终答案</span>
      <!-- 红线 #1 冲突展示占位：由 王翔鹏 的冲突 Diff 视图替换 -->
      <span v-if="!isGuided && session.question_id" class="conflict-note" title="模型讲解与原答案冲突时将同屏展示差异">
        讲解基于题库核验解析；若模型讲解与原答案冲突，将在此同屏展示差异
      </span>
    </div>

    <div class="msg-list" :key="session.session_id">
      <div v-if="messages.length === 0" class="empty">
        <p>对这道题还有什么疑问？可以直接追问某一步的计算过程，例如「为什么第三步这样算？」</p>
        <div class="quick-asks">
          <button v-for="q in ['为什么第三步这样算？', '换个例子说明', '列出计算步骤']" :key="q" class="quick" @click="draft = q">
            {{ q }}
          </button>
        </div>
      </div>

      <template v-for="m in messages" :key="m.message_id">
        <div class="msg" :class="m.role === 'user' ? 'msg-user' : 'msg-assistant'">
          <div class="bubble">
            <div class="bubble-text">{{ m.content }}</div>
            <div v-if="m.tool_result && (!isGuided || session.answer_revealed)" class="tool-result">
              <span class="tool-label">工具结果</span>
              <code>{{ m.tool_result }}</code>
            </div>
            <div v-if="m.citations && m.citations.length" class="citations">
              <span class="cite-label">依据</span>
              <span v-for="(c, i) in m.citations" :key="i" class="cite">{{ c }}</span>
            </div>
          </div>
        </div>
      </template>

      <div v-if="sending" class="msg msg-assistant">
        <div class="bubble bubble-typing">正在结合题干与资料组织讲解…</div>
      </div>
      <div v-if="error" class="msg-error">
        <span>{{ error }}</span>
        <button class="link-btn" @click="retry">重试</button>
        <button class="link-btn" @click="error = ''">关闭</button>
      </div>
    </div>

    <div v-if="isGuided && !session.question_id && !session.answer_revealed" class="quick-asks">
      <button class="btn btn-ghost" :disabled="sending" @click="revealAndAsk">查看完整解答</button>
    </div>

    <div class="input-row">
      <textarea
        v-model="draft"
        rows="2"
        :placeholder="isGuided ? '输入你的思路或卡住的步骤（引导模式将据此给出提示）…' : '追问：为什么这一步这样算？换个例子？'"
        @keydown.enter.exact.prevent="send"
      />
      <button class="btn btn-primary send-btn" :disabled="sending || !draft.trim()" @click="send">
        {{ sending ? '思考中…' : '发送追问' }}
      </button>
    </div>
  </div>
  <div v-else class="no-session">会话不存在，请返回重新提问。</div>
</template>

<style scoped>
.answer-panel {
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  min-height: 420px;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 16px;
  border-bottom: 1px solid var(--c-border);
}
.mode-chip {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-primary);
  background: var(--c-primary-soft);
  border-radius: 999px;
  padding: 4px 10px;
}
.guided-note {
  font-size: 12px;
  color: var(--c-warning);
}
.conflict-note {
  font-size: 12px;
  color: var(--c-text-3);
}
.msg-list {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 460px;
}
.empty {
  color: var(--c-text-3);
  font-size: 13px;
  line-height: 1.7;
}
.quick-asks {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.quick {
  font-size: 12px;
  color: var(--c-primary);
  background: var(--c-primary-soft);
  border: 1px solid #c6d8ff;
  border-radius: 999px;
  padding: 5px 12px;
  cursor: pointer;
}
.msg {
  display: flex;
}
.msg-user {
  justify-content: flex-end;
}
.msg-assistant {
  justify-content: flex-start;
}
.bubble {
  max-width: 78%;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-user .bubble {
  background: var(--c-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.msg-assistant .bubble {
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-bottom-left-radius: 4px;
}
.bubble-typing {
  color: var(--c-text-3);
}
.tool-result {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tool-label, .cite-label {
  font-size: 11px;
  color: var(--c-text-3);
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: 4px;
  padding: 1px 6px;
}
.tool-result code {
  font-size: 12px;
  background: #0f172a;
  color: #a5f3fc;
  border-radius: 6px;
  padding: 4px 8px;
}
.citations {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.cite {
  font-size: 11px;
  color: var(--c-text-2);
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: 999px;
  padding: 2px 8px;
}
.msg-error {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--c-danger);
  background: var(--c-danger-bg);
  border: 1px solid #f3c1c1;
  border-radius: 8px;
  padding: 8px 12px;
}
.link-btn {
  background: none;
  border: none;
  color: var(--c-primary);
  cursor: pointer;
  font-size: 12px;
}
.input-row {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--c-border);
  align-items: flex-end;
}
.input-row textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--c-border);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: var(--font);
  outline: none;
  transition: border-color 0.15s;
}
.input-row textarea:focus {
  border-color: var(--c-primary);
}
.send-btn {
  height: 40px;
}
</style>
