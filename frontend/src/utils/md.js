import MarkdownIt from 'markdown-it'
import { tex } from '@mdit/plugin-tex'
import { renderToString } from 'katex'

const markdown = new MarkdownIt({ breaks: true, html: false }).use(tex, {
  delimiters: 'all',
  mathFence: true,
  render(content, displayMode) {
    const formula = renderToString(content, { displayMode, throwOnError: false, strict: 'ignore' })
    return displayMode ? '<div class="wj-formula">' + formula + '</div>\n' : formula
  }
})

const renderClasses = {
  heading_open: 'wj-rich-h',
  bullet_list_open: 'wj-list',
  code_inline: 'wj-code'
}
for (const [type, className] of Object.entries(renderClasses)) {
  const render = markdown.renderer.rules[type]
  markdown.renderer.rules[type] = (tokens, index, options, env, renderer) => {
    tokens[index].attrJoin('class', className)
    return render
      ? render(tokens, index, options, env, renderer)
      : renderer.renderToken(tokens, index, options)
  }
}

markdown.renderer.rules.blockquote_open = (tokens, index, options, _env, renderer) => {
  const firstParagraph = tokens[index + 2]
  if (firstParagraph?.type === 'inline' && /^(?:\*\*)?说明(?:\*\*)?\s*[:：]/.test(firstParagraph.content)) {
    tokens[index].attrJoin('class', 'wj-source-note')
  }
  return renderer.renderToken(tokens, index, options)
}

export function renderRich(input) {
  return input ? markdown.render(input) : ''
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
