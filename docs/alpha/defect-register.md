# Alpha 缺陷与复测记录

> 测试人：沈雷（K 包）
>
> 复测日期：2026-11-15
>
> 基线：`main@532c68e5fa0456306a3638a0eacfbeda879e7895`

“已验证关闭”仅表示本轮指定环境与步骤通过；线上部署、真实模型和最终候选版仍需按发布日期复测。

| 编号 | 原现象 | 复现与预期 | 本轮实际 | 状态 | 责任人 |
| --- | --- | --- | --- | --- | --- |
| BUG-01 | 线上版本落后于待验收 commit，引用和错误契约不一致 | 读取线上首页资源哈希与 `/api/health`，应匹配当前构建和 81 题 | 线上仍是 `index-tYr4Y4vh.js` / `index-B2UGdxIz.css`、16 题；本地构建为 `index-xKqQ9tEW.js` / `index-BjEtVpGx.css`、81 题 | **开放 P0** | 林子涵、王圣杰 |
| BUG-02 | 曾只载入 16 题占位样例 | `/api/health` 应载入正式库、跳过 0、来源可核验 | 正式库 81 题、索引 81、跳过 0；但 verified 16、pending 64、disputed 1，未达到内容核验目标 | **部分关闭** | 林明亮、龚巍斌、周玘晖 |
| BUG-03 | 推荐和新题详情接口均 404 | `POST /api/recommend` 返回真实候选；`GET /api/question/{id}` 返回题目 | 推荐返回 COP005/COP007/COP020，排除 COP006；详情仍 404 | **部分关闭 P1** | 周玘晖 |
| BUG-04 | 资料页仅有占位，不能导入导出 | 导入预览、取消、写入、导出、清空、恢复可用 | Edge、Chromium 均完成往返；21 条资料交换断言通过 | **已验证关闭** | 高一鹏 |
| BUG-05 | 切到新练习题后答案立即展开 | 新题默认隐藏，主动查看后展开，刷新保持揭示状态 | 两浏览器均通过 | **已验证关闭** | 王翔鹏 |
| BUG-06 | 明确“第N题”前缀未忽略 | `第12题 + COP006 完整题干` 应命中原题 | 返回 `similar`，候选 COP006/COP020，`question_data=null` | **开放 P1** | 周玘晖 |
| BUG-07 | 上传不支持类型只显示 HTTP 415 | 后端返回 `unsupported_type`，前端显示具体原因 | 后端 415 契约正确；页面显示“不支持的文件类型：.bin” | **已验证关闭** | 郑志銮 |
| BUG-08 | 侧栏固定显示“无模型连接” | 根据 health 显示已连接/未配置/未知 | 未再出现固定文案，当前显示“模型状态未知” | **已验证关闭** | 郑志銮 |

## 复测记录

### BUG-06 命令级证据

输入：

```text
第12题
某计算机主存地址 32 位、按字节编址，Cache 数据区容量 32 KB，采用 4 路组相联映射，块大小 64 B。则块内偏移、组索引、标记字段的位数分别是（　）。
```

实际响应：

```json
{
  "match_type": "similar",
  "question_data": null,
  "similar_questions": [
    {"question_id": "COP006"},
    {"question_id": "COP020"}
  ]
}
```

完整响应摘要见 [alpha-acceptance-532c68e.json](evidence/alpha-acceptance-532c68e.json) 的 `bug06_question_prefix`。

### BUG-03 命令级证据

`GET /api/question/COP006` 实际返回：

```json
{
  "status": 404,
  "body": {"detail": "Not Found"}
}
```

推荐接口本身通过，不能因为推荐响应包含完整题目就把详情接口记为已实现。

### BUG-04/05/07/08 浏览器证据

- Edge：[edge-browser-smoke.json](evidence/edge-browser-smoke.json)
- Chromium：[chromium-browser-smoke.json](evidence/chromium-browser-smoke.json)
- 资料页截图：[edge-07-materials.png](evidence/edge-07-materials.png)
- 切题收起：[edge-03-practice-collapsed.png](evidence/edge-03-practice-collapsed.png)
- 主动揭示：[edge-04-practice-revealed.png](evidence/edge-04-practice-revealed.png)
- 上传 415：[edge-08-upload-415.png](evidence/edge-08-upload-415.png)

## 未验证项

| 项 | 原因 | 后续 |
| --- | --- | --- |
| 真实模型引导不泄底、工具结果和 502 重试 | 本轮本地没有配置 Key | 在 11/16 集成版与 11/19 候选版上记录模型名、耗时和人工结论 |
| 线上推荐、详情、资料和历史 | 线上仍是 16 题旧版本 | 林子涵部署候选 commit 后，沈雷用同一验收入口复测 |
| 回滚后的主流程 | 当前无本次候选版本的线上发布与回滚记录 | 林子涵完成发布和回滚后补测 |

## 关闭规则

BUG-03 需在详情接口返回 200 且题号/题干/答案与正式库一致后关闭；BUG-06 需在“第12题”“第 12 题”两种前缀下均返回 COP006 `original` 后关闭；BUG-01 需在线上资源哈希、commit、题库数量和真实模型样例均对应同一候选版本后关闭。
