# API 契约

线上契约以 [Apifox](https://hr124ptabw.apifox.cn/) 为准。

| 接口 | 方法 | 用途 |
| --- | --- | --- |
| `/api/search` | POST | 搜题并返回 `original`、`similar` 或 `miss` 三态 |
| `/api/chat` | POST | 直接解析或引导式答疑 |
| `/api/upload` | POST | 提取 PDF/图片文本并返回处理摘要 |

接口字段名和响应结构不得由个人私自修改。契约变更需先报备 TL，再同步更新 Apifox 和本文件。

> 补充：`GET /api/health` 为部署自检与联调排查接口（题目数、科目分布、核验状态、脏数据明细），
> 不属于业务契约，不进 Apifox，前端不应依赖。如 TL 认为不需要可移除。
> `/api/search` 的三态判定口径与阈值配置见 [question-bank-design.md](question-bank-design.md)。