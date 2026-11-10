# 浏览器流程记录

## 首页

- 页面：`http://127.0.0.1:5173/#/`
- 标题：`问径 · 408 智能体学习工作台`
- 默认数据来源：`backend`
- 文本输入、上传题图、直接讲解、引导学习和开始学习入口均存在。
- 输入Q001前“开始学习”禁用；输入完整题干后按钮启用。

证据：[wenjing-round2-home.png](wenjing-round2-home.png)

## 原题搜索与答疑入口

- 输入Q001完整题干并选择“直接讲解”。
- 页面进入答案页，会话ID写入本地历史。
- 页面展示题库参考答案B与核验解析。
- 当前本地未配置模型Key，AI直接讲解请求显示HTTP 503；参考答案不受影响。

证据：[wenjing-round2-after-search.png](wenjing-round2-after-search.png)

## 历史恢复

- 学习记录页显示Q001会话。
- 会话详情包含完整题干和“继续答疑”入口。
- 点击恢复后回到原答案页，URL携带原会话ID。
- 刷新后题干、模式、参考答案和错误状态仍保留。

证据：[wenjing-round2-history-list.png](wenjing-round2-history-list.png)、[wenjing-round2-history-detail.png](wenjing-round2-history-detail.png)、[wenjing-round2-history-resume.png](wenjing-round2-history-resume.png)；恢复后的 URL、会话 ID 与 localStorage 原始快照见 [history-resume.json](history-resume.json)。

## 同考点推荐与切题

- 点击“再练一道”后显示3道内置示例候选。
- 页面明确显示“示例数据”“同考点·非原题”，没有伪装成真实题库推荐。
- 选择Q-CACHE-033后，模式保持“直接讲解”，旧题状态提示已隔离。
- 缺陷：新题参考答案和完整讲解立即展开，不符合新题初始答案隐藏的验收口径。

证据：[wenjing-round2-recommend-candidates.png](wenjing-round2-recommend-candidates.png)（候选列表）、[wenjing-round2-practice-switch.png](wenjing-round2-practice-switch.png)（切题后）

## 上传与资料

- 上传页支持图片、PDF、MD、TXT选择。
- 上传 `.bin` 时显示“请求失败（HTTP 415）”，但未展示后端具体的 `unsupported_type` 原因。
- 上传 `note.txt` 后成功显示可修正提取文本。
- 点击保存后，“我的资料”生成1份资料、1块切片，切片内容与TXT一致。
- “我的资料”仍是占位简版，没有资料导出、清空后导入及异常导入校验。

证据：[wenjing-round2-upload-415.png](wenjing-round2-upload-415.png)（`.bin` 上传 415 提示）、[wenjing-round2-upload-material.png](wenjing-round2-upload-material.png)（个人资料）

## 个人资料进入追问

已保存资料后，在答案页发送：

```text
请只根据我保存的资料，说明 Cache 行数的计算式。
```

浏览器实际 `/api/chat` 请求的 `context_chunks` 为：

```text
Cache 行数 = Cache 容量 ÷ 主存块大小。
64KB ÷ 64B = 1024 行。
```

当前请求因本地无模型Key返回503，但请求携带资料切片的行为已确认。

证据：[context-chunks-request.json](context-chunks-request.json)
