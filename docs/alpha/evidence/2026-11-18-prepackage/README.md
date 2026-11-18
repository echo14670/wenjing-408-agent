# 2026-11-18 封包前验收证据

> 验收基线：`main@d0886bca71cef466cade11dea85298a761987083`
>
> 验收结论：暂不通过，不能封包。

| 文件 | 内容 |
| --- | --- |
| `backend-pytest.log` | 后端 125 项测试通过 |
| `frontend-tests.log` | 前端默认测试 261 条断言通过 |
| `frontend-build.log` | Vite 生产构建成功 |
| `alpha-acceptance.json` | API 主流程 13 项中 12 项通过；BUG-06 仍失败 |
| `online-check.json` | 线上仍为 16 题旧版本，详情和推荐接口为 404 |
| `history-browser.log` | 历史导入与恢复的双浏览器专项日志 |
| `similar-browser.log` | 相似题详情失败、重试和独立会话专项日志 |
| `browser-edge/` | Edge 真实 API 主流程 JSON 与截图 |
| `browser-chromium/` | Chromium 真实 API 主流程 JSON 与截图 |

浏览器专项中的 `chrome` 标签使用 Playwright 管理的 Chromium，`edge` 使用 Microsoft Edge。

## 阻塞项

- 线上部署仍是 2026-10-30 旧资源，health 仅 16 题，`GET /api/question/COP006` 和 `POST /api/recommend` 仍返回 404。
- BUG-06：`第12题 + COP006 完整题干` 仍返回 `similar`。
- 最新候选代码的真实模型未验证；本地未配置 `LLM_API_KEY`。
- 题库当前为 81 题，但 verified 15、pending 65、disputed 1，尚未完成收尾。
