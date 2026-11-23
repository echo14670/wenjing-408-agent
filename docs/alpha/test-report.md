# Alpha 阶段性系统回归报告

> 测试人：沈雷（K 包）
>
> 测试日期：2026-11-15
>
> 代码基线：`main@532c68e5fa0456306a3638a0eacfbeda879e7895`
>
> 题库基线：`v1.2-alpha`，81 题，更新时间 2026-11-12
>
> 结论：**本地阶段性回归未全通过**。核心搜题、上传、推荐、资料和历史主流程可用；BUG-03 的详情接口与 BUG-06 的“第N题”前缀仍未关闭，线上版本也不是当前基线，真实模型行为未验证。

## 1. 验收范围

本轮按《Alpha 冲刺两周任务分工安排》的 K 包执行，覆盖：

- 搜题三态、固定参数和相似题隔离；
- 正式题库健康状态、推荐候选和已做题排除；
- TXT、文字 PDF、扫描 PDF、混合 PDF、空文件和不支持类型；
- 答疑输入契约与既有自动化中的引导/揭示状态；
- Edge 与 Chromium 两个桌面浏览器中的搜题、推荐、切题、主动揭示、刷新恢复、资料导入导出和历史恢复；
- 旧 BUG-01～08 的逐条复测；
- 当前版本可重复执行的主流程脚本与证据索引。

## 2. 实际环境

| 项目 | 实际值 |
| --- | --- |
| Host | Windows，PowerShell |
| Python | 3.10.11 |
| FastAPI / Uvicorn / pytest | 0.162.5 / 0.54.0 / 9.2.0 |
| Node.js | 24.22.1 |
| Vite | 5.4.21 |
| 后端 | `http://127.0.0.1:8000` |
| 前端 | `http://127.0.0.1:5173` |
| 浏览器 | Microsoft Edge；Playwright Chromium 151.0.7922.34 |
| 模型 | 未配置 `LLM_API_KEY`；真实模型结论记为未验证 |
| 线上 | `http://123.60.34.87/`，当前仍为 16 题旧版本 |

## 3. 自动化结果

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 后端完整 pytest | **113 passed** | [backend-pytest.log](evidence/backend-pytest.log) |
| 前端 8 套脚本 | **238 条断言通过，0 失败** | [frontend-tests.log](evidence/frontend-tests.log) |
| 前端生产构建 | **232 modules transformed，构建成功** | [frontend-build.log](evidence/frontend-build.log) |
| Alpha API 验收入口 | **13 项中 11 通过、2 失败**；失败为 BUG-03/06 产品问题 | [alpha-acceptance-532c68e.json](evidence/alpha-acceptance-532c68e.json) |
| Edge 主流程 | **20/20 通过** | [edge-browser-smoke.json](evidence/edge-browser-smoke.json) |
| Chromium 主流程 | **20/20 通过** | [chromium-browser-smoke.json](evidence/chromium-browser-smoke.json) |

前端 238 条由 chunk 15、chunk-pro 43、practice 53、recommend 52、material-exchange 21、contract 17、request-layer 17、answer-flow 20 组成。后端与前端合计 **351 条本地自动化断言通过**。

当前执行机没有可直接调用的 `npm` 命令，因此本次绕过 `npm test` 聚合器，逐个运行同一组 Node 脚本；生产构建由 Vite 直接完成。该环境差异不影响脚本本身结果。

## 4. 系统场景结果

| 场景 | 实际结果 | 状态 |
| --- | --- | --- |
| 正式题库 health | 81 题载入、索引 81、跳过 0；四科分别为 20/20/21/20 | 通过 |
| 完整题干搜题 | COP006 返回 `original`、题号和已核验解析 | 通过 |
| 相似与未命中隔离 | 改参数返回 `similar` 且 `question_data=null`；无关输入返回 `miss` | 通过 |
| “第12题 + 完整题干” | 仍返回 `similar`，未忽略题号前缀 | **失败，BUG-06** |
| 推荐 | COP006 返回 3 道同章节已核验候选，不含当前题 | 通过 |
| 已做题排除 | 第二组请求排除第一道练习题 | 通过 |
| 题目详情 | `GET /api/question/COP006` 返回 404 | **失败，BUG-03 未完全关闭** |
| TXT/文字 PDF | 提取成功，`failure_details=[]` | 通过 |
| 扫描/混合 PDF | 扫描页明确提示 OCR 限制；混合 PDF 保留成功页并报告失败页 | 通过 |
| 空文件/不支持类型 | 分别返回 400 `empty_file`、415 `unsupported_type`；页面显示具体原因 | 通过 |
| 资料往返 | 导入预览、取消不写入、确认写入、导出、清空、重新导入、刷新恢复均通过 | 通过 |
| 历史恢复 | 检索后学习记录可见，练习刷新后保留揭题状态 | 通过 |
| 真实模型 | 本地无 Key，模型调用返回明确 503 | **未验证，不是通过** |

## 5. 浏览器主流程

两个浏览器都完成了以下同流程：

1. 输入 COP006 完整题干并进入答案页；
2. 展开推荐，确认真实候选且无“示例数据”标记；
3. 切换到 COP005，确认新题答案默认收起；
4. 主动查看答案，确认完整解析展开；
5. 刷新，确认练习态和揭示状态恢复；
6. 学习记录中出现真实检索会话；
7. 资料页完成导入→取消→确认→导出→清空→重导→刷新；
8. 上传 `.bin`，确认页面显示“不支持的文件类型：.bin”；
9. 检查侧栏不再固定显示“交互演示 · 无模型连接”。

机器可读结果与截图见[证据索引](evidence/README.md)。

## 6. 关键请求耗时

以下为浏览器到 Vite 代理再到本地 FastAPI 的单次观测值，仅作本轮环境基线，不是线上 SLA。

| 请求 | Edge | Chromium |
| --- | ---: | ---: |
| `GET /api/health` | 9 ms | 7 ms |
| `POST /api/search`（COP006 原题） | 13 ms | 12 ms |
| `POST /api/recommend`（首次） | 8 ms | 7 ms |
| `POST /api/recommend`（排除已做题） | 10 ms | 7 ms |
| `POST /api/upload`（415） | 8 ms | 5 ms |

## 7. 缺陷结论

逐条复现步骤、责任人与证据见[缺陷与复测记录](defect-register.md)。

| 编号 | 本轮状态 |
| --- | --- |
| BUG-01 线上版本和真实模型一致性 | 仍开放；线上 16 题，资源哈希与当前构建不同，真实模型未验证 |
| BUG-02 正式题库 | 部分关闭；81 题已载入且跳过 0，但只有 16 verified、64 pending、1 disputed |
| BUG-03 推荐与详情 | 部分关闭；POST 推荐已通过，题目详情仍 404 |
| BUG-04 资料管理 | 已验证关闭 |
| BUG-05 切题答案泄露 | 已验证关闭 |
| BUG-06 题号前缀 | 仍开放 |
| BUG-07 上传 415 提示 | 已验证关闭 |
| BUG-08 模型状态误导 | 已验证关闭 |

## 8. 阻塞与风险

- 线上版本不是 `532c68e`，不能把本地回归通过当作线上通过。
- `GET /api/question/{id}` 未实现；推荐响应已经带完整题目，因此前端练习可继续使用，但该接口契约仍未闭环。
- BUG-06 会降低“带题号整题搜索”的原题命中准确性。
- 题库达到 81 题，但核验状态尚未达到交接目标；不得把“载入成功”表述为“内容全部核验通过”。
- 本地无模型 Key，引导不泄底、工具计算、错误重试等真实模型行为只能引用既有自动化中的替身模型用例，不能作为本轮真实模型通过证据。

## 9. 复跑方式

后端：

```powershell
cd backend
python -m pytest -q
python ../scripts/alpha_acceptance.py `
  --output ../docs/alpha/evidence/alpha-acceptance.json
```

`alpha_acceptance.py` 在仍有已知缺陷时默认返回非零。阶段性留档可加
`--allow-known-failures`，失败仍会写入 JSON，不会被隐藏。

前端：

```powershell
cd frontend
npm test
npm run build
```

当前验收命令、API 结果、双浏览器断言和截图均位于 `docs/alpha/evidence/`。11/19 候选版部署后必须用同一入口重跑，并补充线上 commit、资源哈希和真实模型记录。

## 10. GitHub 提交记录

K 包基于 `main@532c68e` 创建 `feature/alpha-system-regression-k` 分支。提交哈希、分支对比和 Pull Request 入口见 [GitHub 提交记录](evidence/github-commits.md)。
