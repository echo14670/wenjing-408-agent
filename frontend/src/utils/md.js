/**
 * 极简富文本渲染器（不引第三方依赖）。
 *
 * 为什么自己写：项目只需要渲染讲解文本里的加粗、行内代码、公式块和列表，
 * 引一个 markdown 库会带来 30KB+ 的包体和无谓的 XSS 面。这里先整体转义，
 * 再用受控的正则做替换，保证不会把用户/模型文本当 HTML 执行。
 */
function escapeHtml(input) {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function inline(text) {
  return text
    .replace(/`([^`\n]+)`/g, '<code class="wj-code">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
}
/**
 * 把纯文本渲染为 HTML 片段。
 * 段落之间用空行分段；单行内的换行保留为 <br>。
 */
export function renderRich(input) {
  if (!input) return ''
  const text = input.replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  const blocks = []
  let buffer = []
  let list = []
  let formula = null
  const flushParagraph = () => {
    if (!buffer.length) return
    const html = inline(escapeHtml(buffer.join('\n'))).replace(/\n/g, '<br>')
    blocks.push(`<p>${html}</p>`)
    buffer = []
  }
  const flushList = () => {
    if (!list.length) return
    blocks.push(`<ul class="wj-list">${list.map((li) => `<li>${inline(escapeHtml(li))}</li>`).join('')}</ul>`)
    list = []
  }
  const flushFormula = () => {
    if (!formula) return
    blocks.push(`<pre class="wj-formula">${escapeHtml(formula.join('\n'))}</pre>`)
    formula = null
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (formula) {
      if (line.trim().endsWith('$$')) {
        formula.push(line.replace(/\$\$\s*$/, ''))
        flushFormula()
      } else {
        formula.push(line)
      }
      continue
    }
    if (line.trim().startsWith('$$')) {
      flushParagraph()
      flushList()
      const rest = line.trim().slice(2)
      if (rest.endsWith('$$') && rest.length > 2) {
        blocks.push(`<pre class="wj-formula">${escapeHtml(rest.slice(0, -2))}</pre>`)
      } else {
        formula = rest ? [rest] : []
      }
      continue
    }
    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }
    const listItem = line.match(/^\s*[-*·]\s+(.*)$/)
    if (listItem) {
      flushParagraph()
      list.push(listItem[1])
      continue
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushParagraph()
      flushList()
      const level = Math.min(heading[1].length + 2, 6)
      blocks.push(`<h${level} class="wj-rich-h">${inline(escapeHtml(heading[2]))}</h${level}>`)
      continue
    }
    flushList()
    buffer.push(line)
  }
  flushFormula()
  flushParagraph()
  flushList()
  return blocks.join('')
}
/** 纯文本摘要，去掉标记符号，用于列表卡片 */
export function plainText(input, max = 120) {
  const text = (input ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/[#*`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}
