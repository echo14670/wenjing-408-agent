# Alpha 验收证据索引

> 基线：`main@532c68e5fa0456306a3638a0eacfbeda879e7895`
>
> 日期：2026-11-15

## 自动化日志

| 文件 | 内容 |
| --- | --- |
| [backend-pytest.log](backend-pytest.log) | 113 passed |
| [frontend-tests.log](frontend-tests.log) | 8 套脚本、238 条断言通过 |
| [frontend-build.log](frontend-build.log) | Vite 生产构建、232 modules |
| [alpha-acceptance-532c68e.json](alpha-acceptance-532c68e.json) | 主流程 API 验收；11 通过、2 个已知失败 |

## 版本与数据

| 文件 | 内容 |
| --- | --- |
| [github-commits.md](github-commits.md) | GitHub 分支、基线及提交链接 |
| [health-local.json](health-local.json) | 本地 81 题、四科分布和核验状态 |
| [health-online.json](health-online.json) | 线上仍为 16 题 |
| [online-index-resources.txt](online-index-resources.txt) | 线上资源哈希为旧构建 |
| [../samples/material-exchange-valid.json](../samples/material-exchange-valid.json) | 脱敏资料交换有效样本 |
| [../samples/material-exchange-mixed.json](../samples/material-exchange-mixed.json) | 有效、重复、空正文混合样本 |

上传样本继续复用仓库内的 `第二轮测试/samples/`：TXT、文字 PDF、扫描 PDF、混合 PDF、空文件、损坏 PDF、PNG 和不支持类型。

## 浏览器机器可读结果

| 文件 | 内容 |
| --- | --- |
| [edge-browser-smoke.json](edge-browser-smoke.json) | Edge 20 项断言、API 状态和请求耗时 |
| [chromium-browser-smoke.json](chromium-browser-smoke.json) | Chromium 20 项断言、API 状态和请求耗时 |

## 浏览器截图

`edge-01`～`edge-08` 与 `chromium-01`～`chromium-08` 为相同流程的两套截图：

1. `01-original-answer.png`：完整题干命中原题；
2. `02-real-recommend.png`：真实推荐候选；
3. `03-practice-collapsed.png`：切题后答案收起；
4. `04-practice-revealed.png`：主动查看答案；
5. `05-practice-after-refresh.png`：刷新恢复；
6. `06-history.png`：学习记录；
7. `07-materials.png`：资料导入、清空、重导和刷新后的状态；
8. `08-upload-415.png`：上传不支持类型的具体原因。

## 证据边界

- 浏览器 JSON 中的通用 `Failed to load resource` 控制台记录来自本轮主动验证的 404/503 路径，不是页面崩溃；具体接口状态见 `api_responses`。
- 请求耗时仅代表 2026-11-15 本机无头浏览器到本地服务的观测值。
- 截图不证明线上版本；版本结论必须以本地/线上 health 与资源哈希对照为准。
