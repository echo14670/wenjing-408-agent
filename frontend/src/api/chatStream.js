import { http, toAppError } from './client'

const STREAM_TYPE = 'application/x-ndjson'

async function readEvents(stream, onDelta) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      const lines = pending.split('\n')
      pending = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line)
        if (event.type === 'delta') onDelta(event.text)
        if (event.type === 'done' && typeof event.response?.reply === 'string') return event.response
        if (event.type === 'error') {
          throw toAppError({ response: { status: event.status, data: event } })
        }
      }
    }
    throw { kind: 'network', code: 'CHAT_STREAM_INTERRUPTED', message: '讲解中断，请重试。' }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function requestChatStream(config, onDelta) {
  try {
    const { data, headers } = await http.request({
      ...config,
      adapter: 'fetch',
      responseType: 'stream',
      headers: { ...config.headers, Accept: STREAM_TYPE }
    })
    if (headers['content-type']?.startsWith(STREAM_TYPE)) {
      return await readEvents(data, onDelta)
    }
    return await new Response(data).json()
  } catch (error) {
    if (error.response?.data instanceof ReadableStream) {
      error.response.data = await new Response(error.response.data).json().catch(() => null)
    }
    throw toAppError(error)
  }
}
