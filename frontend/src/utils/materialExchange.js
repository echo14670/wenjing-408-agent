/**
 * 个人资料交换格式（materials-exchange v1，契约 §3.4-E）
 *
 * 纯前端、基于浏览器本地存储的资料往返闭环：
 *   导出：把 localStorage 中的资料序列化为「wenjing-materials」JSON 文件；
 *   导入：解析文件 → 校验 → 去重 → 预览，用户确认后才写入（取消不改动任何数据）。
 *
 * 边界：
 *  - 只搬运资料本身，禁止包含聊天记录、模型 Key、其他 localStorage 数据；
 *  - 版本不支持时整体拒绝；不携带后端接口、不做 OCR；
 *  - 导入文件中的 chunks 一律忽略，以 extracted_text 为准重新切片，保证切片口径统一。
 */

export const EXCHANGE_FORMAT = 'wenjing-materials'
export const EXCHANGE_VERSION = 1

/** 还原一份资料的原始正文：优先用 extracted_text，旧数据无该字段时由切片拼接兜底。 */
export function restoreText(material) {
  if (typeof material?.extracted_text === 'string' && material.extracted_text) {
    return material.extracted_text
  }
  return (material?.chunks || []).map((c) => c.text).join('\n')
}

/**
 * 内容摘要（djb2）：对规范化后的正文取稳定哈希。
 * 用于「按正文摘要判重」以及缺失 material_id 时补全 ID。
 */
export function contentDigest(text) {
  const normalized = String(text || '').replace(/\s+/g, '').trim()
  let hash = 5381
  for (let i = 0; i < normalized.length; i += 1) {
    // hash * 33 + charCode，用无符号右移保证结果为非负整数
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

/** 构造导出对象（不落盘、不下载，序列化由调用方处理）。 */
export function buildExchangePayload(items) {
  return {
    format: EXCHANGE_FORMAT,
    version: EXCHANGE_VERSION,
    exported_at: new Date().toISOString(),
    items: (items || []).map((m) => ({
      material_id: m.material_id,
      title: m.title,
      file_type: m.file_type,
      created_at: m.created_at,
      extracted_text: restoreText(m)
    }))
  }
}

function fail(error, stage) {
  return { ok: false, stage, error, total: 0, candidates: [], skipped: [], invalid: [] }
}

/**
 * 解析并校验导入文件，返回预览结果（不写入任何数据）。
 * @param {string} text 文件文本
 * @param {Array} existingItems 当前资料库条目，用于去重
 * @returns {{ok:boolean, error?:string, total:number, candidates:Array, skipped:Array, invalid:Array}}
 */
export function parseExchange(text, existingItems = []) {
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    return fail('文件损坏：不是合法的 JSON，无法导入。', 'parse')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return fail('结构错误：顶层应为包含 format/version/items 的对象。', 'structure')
  }
  if (data.format !== EXCHANGE_FORMAT) {
    return fail(`结构错误：格式标识应为 "${EXCHANGE_FORMAT}"，当前为 "${data.format ?? '缺失'}"。`, 'structure')
  }
  if (data.version !== EXCHANGE_VERSION) {
    return fail(`版本不支持：仅支持 version=${EXCHANGE_VERSION}，当前为 "${data.version ?? '缺失'}"，已整体拒绝。`, 'version')
  }
  if (!Array.isArray(data.items)) {
    return fail('结构错误：缺少 items 数组。', 'structure')
  }

  const existingIds = new Set(existingItems.map((m) => m.material_id))
  const existingDigests = new Set(existingItems.map((m) => contentDigest(restoreText(m))))
  // 记录本次文件内部已出现的 ID/摘要，避免同一文件内重复条目被重复写入
  const batchIds = new Set()
  const batchDigests = new Set()

  const candidates = []
  const skipped = []
  const invalid = []

  data.items.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      invalid.push({ index, title: '', reason: '条目不是有效对象' })
      return
    }
    const body = typeof raw.extracted_text === 'string' ? raw.extracted_text : ''
    if (!body.trim()) {
      invalid.push({ index, title: raw.title || '', reason: '正文为空或缺失 extracted_text' })
      return
    }
    const digest = contentDigest(body)
    let id = typeof raw.material_id === 'string' && raw.material_id.trim() ? raw.material_id.trim() : null
    if (!id) id = `mat_${digest}` // 缺失 ID：按正文摘要补全

    if (
      existingIds.has(id) ||
      existingDigests.has(digest) ||
      batchIds.has(id) ||
      batchDigests.has(digest)
    ) {
      skipped.push({ index, title: raw.title || id, reason: '与资料库或文件内其他条目重复，已跳过' })
      return
    }

    batchIds.add(id)
    batchDigests.add(digest)
    candidates.push({
      material_id: id,
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : `导入资料 ${index + 1}`,
      file_type: typeof raw.file_type === 'string' && raw.file_type.trim() ? raw.file_type : 'text',
      created_at: typeof raw.created_at === 'string' && raw.created_at ? raw.created_at : new Date().toISOString(),
      extracted_text: body
    })
  })

  return { ok: true, error: null, total: data.items.length, candidates, skipped, invalid }
}
