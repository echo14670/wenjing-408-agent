/**
 * 兼容入口（Alpha · TD-02）。
 *
 * 本文件**不再创建 axios 实例**，只把统一客户端 `client.js` 再导出一次，
 * 让仍从这里 import 的旧代码（含测试脚本、其他成员的在进行分支）无需改动。
 * 新代码请直接从 `@/api/client` 引入。
 */
export { http, request, withSignal, toAppError, isCanceled } from './client'
