# P 包验收文档：上传解析收尾与个人资料本地闭环

> 负责人：高一鹏（P 包）｜对应技术债 D5、BUG-04、PENDING-03
> 基线：main 分支，HEAD `4705d33`（PR #22 合并后）
> 范围：纯前端、基于浏览器本地存储的资料导入/导出/清空/异常校验闭环；不新增后端接口、不做 OCR、不建后端资料库。

## 一、交付文件清单

| 文件 | 类型 | 说明 |
| :--- | :--- | :--- |
| `frontend/src/views/MaterialsView.vue` | 新增 | 由 MaterialsStub 升级的完整资料页：列表、正文展开、切片预览、删除、清空、导入/导出 |
| `frontend/src/utils/materialExchange.js` | 新增 | 交换格式 materials-exchange v1：导出对象、解析校验、去重、ID 补全 |
| `frontend/src/store/materials.js` | 修改 | 保存 extracted_text 原文；新增 previewImport/confirmImport/exportExchangeText |
| `frontend/src/store/wjMaterials.js` | 不变（已兼容） | 复用同一 base store，contextFor 自动读取导入资料 |
| `frontend/src/router/index.js` | 修改 | `/materials` 路由指向 MaterialsView（仅资料路由一行） |
| `frontend/scripts/test-material-exchange.mjs` | 新增 | 交换模块单测 21 项 |
| `frontend/package.json` | 修改 | 接入 test:material-exchange |
| `frontend/src/views/MaterialsStub.vue` | 删除 | 占位页已被 MaterialsView 替代 |
| `docs/upload-api.md` | 修改 | 新增第九节：前端本地闭环与交换格式 |

## 二、数据模型与存储

- 存储键：localStorage `wenjing:materials:v1`（前缀 `wenjing:` + 常量 `materials:v1`），仅存当前浏览器，不进后端。
- 资料条目：

```js
{
  material_id, title, file_type,
  extracted_text,        // 原始正文（本版本新增，导出用）
  chunks: [{ chunk_id, order, text }],
  created_at, updated_at
}
```

- 早于本版本的条目无 `extracted_text`，由 `restoreText` 用 `chunks` 拼接兜底，不影响读取与导出。
- 切片仍由 `utils/chunkText.js` 的 `chunkMaterial` 完成（默认 maxLength 800 / overlap 80 / minChunk 120），统一入口，不另造存储。

## 三、功能验收点

1. 资料列表展示份数、切片数、随请求携带数（context_chunks）统计。
2. 单条可展开查看原始正文，并展示全部切片；可单条删除；可清空整个资料库（有确认提示）。
3. 导出：生成 `wenjing-materials` JSON，仅含资料五字段，不含聊天记录/Key/其他存储。
4. 导入：选择文件后先解析校验，内联面板展示「可导入/重复跳过/无效」条数与逐条原因；确认后才写入，取消不改动数据。
5. 往返闭环：导出 → 清空 → 导入 → 刷新，资料仍在；答疑侧 `contextFor(query)` 可读取并随 `/api/chat` 的 `context_chunks` 发送。

## 四、异常校验（五类）

| 类型 | 触发条件 | 处理 |
| :--- | :--- | :--- |
| 损坏 JSON | `JSON.parse` 失败 | 整体拒绝 |
| 版本不支持 | `version !== 1` | 整体拒绝 |
| 结构错误 | `format` 不符或 `items` 缺失 | 整体拒绝 |
| 空正文 | `extracted_text` 为空/纯空白 | 该条计无效 |
| 部分无效 | 有效与无效条目混合 | 有效导入、无效列原因 |

去重规则：`material_id` 相同或正文摘要（djb2，忽略空白）相同即判重，重复跳过不覆盖；缺失 ID 按摘要补全；文件内部重复同样处理。

## 五、自验结果

- 环境：Node v22.23.2，依赖 `npm install` 安装 62 个包。
- `npm test`：6 套测试全部通过（chunk / chunk-pro / practice / material-exchange / contract / answer-flow），其中新增 material-exchange 单测 21 项通过、0 失败。
- `npm run build`：构建成功（2.62s），MaterialsView 正确分包（JS 5.39 kB / CSS 4.99 kB），无编译错误。

## 六、边界与说明

- 不改动后端上传接口的错误结构（400/413/415 保持 `detail.code/message`），后端三文件仅为既有收尾，本包未改其错误形状。
- 导入文件中的 `chunks` 一律忽略，以 `extracted_text` 重新切片，保证与资料库切片口径一致。
- 未执行 git commit/推送：是否提交及如何走镜像推送由用户确认后处理。
