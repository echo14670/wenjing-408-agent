/**
 * 旧默认导入入口（Alpha · TD-02 兼容转发）。
 *
 * 以前这里自行创建了第二个 axios 实例，带自己的 15s 超时和 JSON 头，
 * 与 `http.js` 形成两套传输规则。现在改为**纯转发**：
 *   - 不创建实例、不定义超时、不挂错误转换器；
 *   - 所有方法都落到 `client.js` 的唯一实例上，错误形状与超时策略只有一份。
 *
 * 保留原因：`api/search.js`、`api/chat.js`、`api/upload.js` 等旧调用方与
 * 部分测试脚本仍以 default import 使用。11/18 迁移完成后可整体删除。
 */
import { http, request as send } from './client'

/** 支持 `request(config)` 与 `request.post(url, data, config)` 两种旧写法 */
function legacyRequest(config) {
  return send(config)
}

for (const method of ['get', 'delete', 'head', 'options']) {
  legacyRequest[method] = (url, config) => send({ ...(config || {}), url, method: method.toUpperCase() })
}
for (const method of ['post', 'put', 'patch']) {
  legacyRequest[method] = (url, data, config) =>
    send({ ...(config || {}), url, method: method.toUpperCase(), data })
}

legacyRequest.request = legacyRequest
// 只为兼容测试/调试里对 adapter、headers 的读取；指向同一份 defaults
legacyRequest.defaults = http.defaults
legacyRequest.interceptors = http.interceptors

export default legacyRequest
