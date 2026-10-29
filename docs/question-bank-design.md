# 题库数据结构、存储方案与检索方式设计

> 责任人：周玘晖（后端 · 检索链路）
> 对应交付物：`/api/search` 接口、`backend/data/questions.json`、本设计文档
> 状态：方案定稿 + 代码已实现（分支 `feature/backend-question-bank`），待 TL 评审后合入

---

## 一、设计约束

本方案受以下团队红线约束，任何调整都需重新评估这些前提：

| 约束 | 来源 | 在本方案中的落点 |
| --- | --- | --- |
| 接口字段名与结构以 Apifox 为准，严禁私自修改 | 开发交接指南 · 红线 | 接口出入参单独建模（`app/schemas/search.py`），与题库内部模型解耦 |
| 三态严格隔离，相似题不可进入作答与追问 | 开发基准 · 业务底线 | 判定宁可偏保守：参数不一致、未核验一律降级为 `similar` |
| 防幻觉：优先展示题库核验解析，不得编造出处 | 开发基准 · 业务底线 | `review_state` 参与判定；`source_ref` 缺失时不展示来源 |
| 后端无状态 | 架构决策 | 题库只读，进程内存索引，不保存用户数据 |
| 前端无状态切片，个人资料不入库 | 开发基准 | 检索接口不接收、不存储任何用户资料 |
| 能演示、不画大饼 | 作业要求 | 全部能力均已实现并有测试覆盖，未实现的写在「待确认事项」 |

---

## 二、题库数据结构

### 2.1 文件结构

题库资产为单一文件 `backend/data/questions.json`：

```json
{
  "version": "1.0",
  "updated_at": "2026-10-29",
  "source_table": "docs/question-sources.md",
  "knowledge_points": [ { "kp_id": "KP-001", "name": "Cache 组相联映射", "subject": "计算机组成原理" } ],
  "questions": [ { "...": "题目对象" } ]
}
```

顶层字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `version` | string | 否 | 结构版本号，结构变更时递增 |
| `updated_at` | string | 否 | 数据更新日期，便于联调时确认版本 |
| `source_table` | string | 否 | 指向《资料来源表》（林明亮维护） |
| `knowledge_points` | array | 否 | 考点字典，`kp_id` + `name`，对应数据字典中的 KnowledgePoint |
| `questions` | array | 是 | 题目列表；也兼容「顶层直接是数组」的简写格式 |

### 2.2 题目对象（Question）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `question_id` | string | ✅ | 全局唯一，如 `Q001`。`/api/chat` 用其回查题目 |
| `subject` | string | ✅ | 科目，见枚举表 |
| `stem` | string | ✅ | 题干原文，检索的主依据 |
| `chapter` | string | 否 | 所属章节 |
| `question_type` | string | 否 | 题型，见枚举表，默认 `single_choice` |
| `options` | string[] | 否 | 选项列表，非选择题留空 |
| `answer` | string | 否 | 标准答案，如 `B` |
| `solution` | string | 否 | 核验解析，原题命中时展示 |
| `source_ref` | string | 否 | 出处说明，**不得编造真题年份 / 教材页码** |
| `review_state` | string | 否 | 核验状态，默认 `pending`，**参与三态判定** |
| `knowledge_points` | string[] | 否 | 关联考点名称，参与检索加权与后续同考点推荐 |
| `year` | int \| null | 否 | 年份，暂无可靠出处时保持 `null` |
| `difficulty` | int(1-5) \| null | 否 | 难度，暂无可靠出处时保持 `null` |
| `tags` | string[] | 否 | 检索关键词，如 `["Cache", "组相联"]` |

枚举约定：

- `subject`：`数据结构` / `计算机组成原理` / `操作系统` / `计算机网络`
- `question_type`：`single_choice` / `multiple_choice` / `fill_blank` / `short_answer` / `calculation` / `comprehensive`
- `review_state`：`pending`（待核验）/ `verified`（已核验）/ `disputed`（有争议）；兼容中文写法，未知值按最保守的 `pending` 处理

### 2.3 内部模型与契约模型解耦

题库字段属于**数据资产**，可以随数据同学的需求扩展（如后续增加 `sub_questions`、`images`）；
对外接口的出入参属于**契约**，严格对齐 Apifox。两者由不同 Pydantic 模型承载：

- `app/schemas/question.py`：题库内部模型（可扩展）
- `app/schemas/search.py`：接口出入参（严格契约，九个字段）

接口输出时由 `app/api/search.py` 裁剪，**内部扩展字段不会外泄**，因此扩充题库字段不需要变更契约。

### 2.4 当前样例数据

仓库内已放入 16 题样例（覆盖四门科目 + Cache 基准用例 + 参数变式），用于：

1. 验证三态判定在真实数据上的表现；
2. 让前端在后端就绪后能直接切到本地后端联调。

> ⚠️ 样例题目仅供结构校验与联调，**来源标注为「联调样例 · 待《资料来源表》替换」**，
> 不得作为真题出处使用。正式题库由林明亮交付后整体替换 `questions` 数组，
> 并同步更新 `source_ref` 与 `review_state`（默认应为 `pending`，核验后再置为 `verified`）。

---

## 三、存储方案

### 3.1 选型对比

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| **JSON 文件 + 内存索引** | 零运维、Git 可 diff 可评审、数据同学直接交付、启动即可用 | 万级以上内存占用上升；多人同时改数据易冲突 | ✅ **采用** |
| SQLite | 支持 SQL 过滤与分页、单文件 | 需要写迁移脚本与入库工具，数据同学交付链路变长 | 备选 |
| Elasticsearch | 检索能力强 | 需要额外服务实例，部署成本高，超出本作业范围 | 不采用 |
| 向量库（语义检索） | 能处理同义改写 | 需要 embedding 服务与额外依赖，且相似题判定反而更模糊 | 不采用（见 §6） |

### 3.2 决策与理由

**采用「JSON 文件作为唯一事实来源 + 进程启动时载入内存构建索引」**：

1. 408 题库量级在千级至万级，单条题目约 1KB，万级也只有约 10MB，内存完全容纳；
2. 数据同学（林明亮）交付的是一个可 review 的文件，不需要后端写导入脚本；
3. 部署（林子涵）无需额外数据库实例，`docker-compose` 起一个容器即可；
4. 检索在毫秒级完成，满足演示的体感要求。

### 3.3 加载与容错

题库加载器 `app/services/question_store.py` 遵循「**脏数据不拖垮服务**」：

- 文件不存在 → 记 warning，题库为空，**检索全部返回 `miss`**，服务正常启动；
- 整体 JSON 解析失败 → 抛 `QuestionStoreError`，启动即暴露问题，便于定位；
- 单条题目字段非法 → 跳过该题并记录到 `stats()["skipped"]`，其余题目照常提供服务；
- 顶层为数组、字段缺失、中文 `review_state` 等写法均做兼容。

`GET /api/health` 会输出题目总数、科目分布、核验状态分布与跳过明细，供联调排查。

### 3.4 迁移路径

存储与检索通过窄接口隔离：`QuestionStore.load()` 返回 `list[Question]`，检索层只依赖这个列表。
后续若要换 SQLite 或引入语义检索，只需提供同样接口的新实现，`app/services/retrieval.py` 与路由层无需改动。

---

## 四、检索方式

### 4.1 整体流程

```
raw_input
  ↓ ① 归一化（NFKC 全角转半角 / 小写 / 去空白 / 去标点 / 去题号前缀）
  ↓ ② 分词（jieba；未安装时降级为「英文整词 + 中文 bigram」）
  ↓ ③ 字段加权倒排索引 + BM25 打分
  ↓ ④ 参数（数字 + 单位）一致性校验
  ↓ ⑤ 三态判定（original / similar / miss）
契约响应
```

### 4.2 归一化

统一处理用户复制题干时带入的排版差异：全角字符、中英文空格、大小写、题号前缀（`12.` `（3）`）。
注意题号剥离只在**数字后有明确分隔符**时生效，避免把 `32 位地址` 的 `32` 当成题号吃掉。

### 4.3 分词

- 优先使用 `jieba`，启动时预热，避免首个请求承担词典加载开销；
- 未安装 `jieba` 时自动降级为「英文整词 + 中文 2-gram」——效果是召回略噪，但**服务不会报错**，
  这条降级路径有专门的测试用例覆盖（部署环境装不上 `jieba` 时仍可演示）。

### 4.4 索引与打分

字段权重体现「题干比解析更重要」：

| 字段 | 权重 |
| --- | --- |
| `stem` | 1.0 |
| `knowledge_points` | 0.6 |
| `chapter` | 0.5 |
| `tags` | 0.4 |
| `options` | 0.35 |
| `solution` | 0.2 |

打分公式（BM25，k1=1.5，b=0.75）：

```
bm25_norm = bm25 / (bm25 + 6)
coverage  = 命中的查询词数 / 查询词总数
penalty   = 0.55 + 0.45 × 参数一致率
score     = (0.55 × bm25_norm + 0.45 × coverage) × penalty
score     += 0.12   （题干与查询互为子串时）
```

其中 `coverage` 用于衡量「查询词是否基本都出现在题干里」，
`penalty` 用于惩罚参数不一致的候选（详见下节）。

### 4.5 参数一致性（408 场景的关键）

408 计算题经常是「同一题型换参数」：Cache 容量从 64KB 换成 16KB，就是另一道题。
若参数不同却判成原题，会把错答案包装成「核验解析」给用户——这正是防幻觉红线要拦的情况。

因此抽取题干中的**数字 + 单位**（`64kb`、`64b`、`32位`、`4mb`）做集合比对：

- 查询参数被题目完全覆盖 → 参数一致率 1.0，不惩罚；
- 部分覆盖 → 按比例惩罚（最低 0.55）；
- **只要参数不完全一致，就绝不判 `original`**，直接降级为 `similar`。

### 4.6 三态判定规则

```
① 综合分 ≥ original_threshold（0.72）
   或 强命中（查询词 ≥3 个 且 覆盖度 ≥0.9 且 参数一致 且 bm25 ≥0.2 且 分数 ≥ 阈值×0.85）
      ↓
      参数不一致？            → similar（reason: params_mismatch）
      完整题目无法唯一确认？  → similar（reason: identity_not_confirmed）
      review_state 非已核验？ → similar（reason: unverified:pending / disputed）
      否则                   → original
② 综合分 ≥ similar_threshold（0.45） → similar
③ 其余                              → miss
```

判定口径说明：

- **强命中分数**：BM25 的 idf 依赖题库规模，强命中规则将分数门槛最多放宽到原阈值的 85%。这只是候选分数条件，不能单独确认原题。
- **完整题目身份**：题干，或题干加同序选项，必须在严格文本比较后唯一匹配，才能判为 `original`。身份比较保留大小写、内部空白、字符宽度、正负号、小数点、指数符号、选项顺序和提问措辞。只输入片段、换了所问内容、改变否定词或无法区分多个选项版本时，返回 `similar`。
- **保守策略的代价**：语义相同但措辞或标点明显不同的题目也可能只返回相似题。这时继续围绕用户原始题干解题，不冒用候选题的核验答案。
- **未核验降级**（默认策略 `SEARCH_UNVERIFIED_POLICY=downgrade`）：待核验 / 有争议的题目不判 `original`，
  降级为 `similar`，避免把未经验证的解析当核验解析展示。策略可切为 `allow`（需 TL 确认并同步文档）。
- **相似题列表**另设单条门槛（默认 0.35），宁可少给也不硬凑一屏无关题。

### 4.7 阈值与环境变量

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `SEARCH_ORIGINAL_THRESHOLD` | `0.72` | 原题阈值，调大更保守 |
| `SEARCH_SIMILAR_THRESHOLD` | `0.45` | 相似阈值，调小更容易给相似题 |
| `SEARCH_SIMILAR_ITEM_MIN_SCORE` | `0.35` | 相似题单条最低分 |
| `SEARCH_MAX_SIMILAR` | `5` | 相似题最多返回条数 |
| `SEARCH_UNVERIFIED_POLICY` | `downgrade` | 未核验题目处置策略 |
| `QUESTION_BANK_PATH` | `backend/data/questions.json` | 题库路径 |

阈值集中在一处，QA（沈雷）可直接在 `.env` 调参复现，无需改代码。

### 4.8 回归验证场景

| 场景 | 预期结果 |
| --- | --- |
| 完整复制 Cache 基准题干 | `original`，返回 Q001 的核验解析 |
| 完整题干有全角或内部空格等变化 | 仍可召回 `similar`，不能假定是无意义的排版差异 |
| 只输入“四路组相联，组号占 2 位” | `similar`，不能凭片段假定容量为 64KB |
| 相同 Cache 参数，但改问标记与偏移位数 | `similar`，不能当成“组号占 2 位是否正确”的原题 |
| 改变正确/错误、正负号或选项顺序 | 不得复用原题身份 |
| 相同题干对应多个选项版本，未提供选项 | `similar`，不能任意选一个版本 |
| 无关问题、空题库 | `miss` |

仅首尾空白与明确的“第 N 题”前缀可在身份比较时忽略。其他排版和措辞变化保守地返回相似题，避免改变代码、单位或字符串含义。

HTTP 字段仍使用原契约。以上变化只收紧内部身份判定，不新增检索字段。

---

## 五、接口实现

### 5.1 POST /api/search

请求（契约原样）：

```json
{ "raw_input": "32位物理地址Cache...", "input_type": "text" }
```

响应（契约原样）：

```json
{
  "match_type": "original",
  "question_data": {
    "question_id": "Q001",
    "subject": "计算机组成原理",
    "chapter": "存储系统",
    "stem": "...",
    "options": ["A. ...", "B. ..."],
    "answer": "B",
    "solution": "...",
    "review_state": "verified",
    "source_ref": "..."
  },
  "similar_questions": []
}
```

三态互斥：`original` 返回 `question_data` 且 `similar_questions` 为 `[]`；
`similar` 的 `question_data` 为 `null`；`miss` 两者均为空。

入参校验（`app/schemas/search.py`）：

| 情况 | 处理 |
| --- | --- |
| `raw_input` 缺失 / 空白 | `422`（区别于「题库没收录」的 `miss`，前端可分别提示） |
| `raw_input` 超过 4000 字 | `422` |
| `input_type` 非 `text` / `image` | `422` |
| `input_type` 缺省 | 按 `text` 处理 |

关于 `input_type: image`：v1 后端不做 OCR。图片文本由上传链路（高一鹏 `/api/upload`）或前端提取后
通过 `raw_input` 传入，检索逻辑与文字输入完全一致；若 `raw_input` 为空或纯空白，入参校验返回 `422`。
**这是有意不实现的部分，不在演示中宣称支持图片直搜。**

### 5.2 GET /api/health（非契约接口）

仅用于部署自检与联调排查，返回题目总数、科目分布、核验状态分布、跳过的脏数据、分词器类型。
不参与 Apifox 契约，若 TL 认为不需要，删除 `backend/app/api/health.py` 及 `main.py` 中的一行注册即可。

### 5.3 目录落位

```
backend/
├── main.py                      # 启动入口（CORS / 路由注册 / 预热）
├── requirements.txt
├── app/
│   ├── api/search.py            # /api/search 路由
│   ├── api/health.py            # /api/health 自检
│   ├── core/config.py           # 环境变量与检索阈值
│   ├── deps.py                  # 题库与检索服务单例
│   ├── schemas/question.py      # 题库内部模型（可扩展）
│   ├── schemas/search.py        # 接口出入参（严格契约）
│   └── services/
│       ├── question_store.py    # 题库加载与容错
│       ├── retrieval.py         # 索引 + BM25 + 三态判定
│       └── text_utils.py        # 归一化 / 分词 / 参数抽取
├── data/questions.json          # 题库资产
└── tests/                       # 检索与契约回归用例
```

`/api/chat`（王圣杰）与 `/api/upload`（高一鹏）接入时，只需各自新增 `app/api/*.py`
并在 `main.py` 注册，与检索链路互不影响。

---

## 六、测试与验收

`backend` 目录下执行 `pytest`，当前 **56 条用例全部通过**，覆盖：

- 文本预处理：全角半角、题号剥离、分词降级、参数抽取
- 三态判定：原题（整段 / 片段 / 噪声）、相似（参数变式）、未命中（无关 / 检索服务空输入 / 空题库）
- 防幻觉：未核验降级、有争议降级、策略可切换、中文核验状态归一化
- 契约：响应字段集合与 Apifox 一致、三态互斥、422 校验、单词查询不判原题
- 题库加载：真实题库、脏数据跳过、文件缺失降级、JSON 损坏报错
- **Cache 基准案例**：团队验收红线，命中 Q001 且答案为 B

建议 QA 补充的体验类用例（不在自动化范围内）：

1. 从 PDF 复制的题干（带换行、页眉页脚）能否稳定命中原题；
2. 只输入题干前半句 / 后半句时的判定是否合理；
3. 同一道题换科目表述（如「计组」简称）时的召回情况。

---

## 七、待确认事项（需 TL / 团队拍板）

1. **`/api/health` 是否保留**：部署自检需要，但属于契约外接口，请 TL 确认。
2. **相似态是否返回 `chapter`**：目前 `similar_questions` 只含契约四字段，若前端卡片想展示章节需报备后同步 Apifox。
3. **未核验策略默认值**：当前 `downgrade`（保守）。若演示时题库大量为 `pending`，原题命中率会偏低，
   可临时切 `allow`，但必须在演示中说明。
4. **阈值最终值**：当前阈值基于 16 题样例调优。正式题库交付后需重新跑 §4.8 的实测表并校准。
5. **是否引入语义检索**：BM25 处理不了同义改写（见 §4.8 末行）。若团队认为有必要，
   建议作为 P1 增量：在 BM25 召回后对 Top-N 做语义重排，而不是替换现有检索。

---

## 附录：题库交付 checklist（给林明亮）

1. 题目内容以真题 / MOOC / 原创变式为准，**出处不明确的不要编造年份与页码**，`source_ref` 可留空；
2. `review_state` 初始一律 `pending`，核验通过后改 `verified`，存疑改 `disputed`；
3. `question_id` 全局唯一且稳定（后续 `/api/chat` 与本地学习记录都会引用）；
4. 交付前本地跑一次 `pytest`，`GET /api/health` 的 `skipped` 应为空；
5. 同步更新 `source_table` 指向的《资料来源表》。

## 本次与原 stage2 接口的对应关系

- `/api/search` 请求仍为 `raw_input`、`input_type`，三态响应字段保持不变。
- 相似题不返回标准答案，也不绑定为用户当前题目；用户原始题干可通过已有 `session_messages` 进入后续 AI 解题分支。
- 独立的学科、年份、题号过滤尚不在本次契约中。若团队需要，先由接口负责人明确字段，再同时调整前后端。
- `/api/chat`、`/api/upload` 仍由对应链路成员接入。本次未添加这些路由的假实现。
