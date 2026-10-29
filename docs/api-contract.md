# API 契约

线上契约以 [Apifox](https://hr124ptabw.apifox.cn/) 为准。

| 接口 | 方法 | 用途 |
| --- | --- | --- |
| `/api/search` | POST | 搜题并返回 `original`、`similar` 或 `miss` 三态 |
| `/api/chat` | POST | 直接解析或引导式答疑 |
| `/api/upload` | POST | 提取 PDF/图片文本并返回处理摘要 |

接口字段名和响应结构不得由个人私自修改。契约变更需先报备 TL，再同步更新 Apifox 和本文件。

