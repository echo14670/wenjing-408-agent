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

### 2.4 当前数据

| 文件 | 内容 | 用途 |
| --- | --- | --- |
| `data/questions.json` | **正式题库 80 题**（四科各 20，林明亮交付） | 服务运行时加载 |
| `data/questions.sample.json` | 样例 16 题（含已核验的 Cache 基准题 Q001） | 单测与三态回归基线 |
| `data/questions_80_raw.json` | 原始交付件留档 | 转换输入，便于追溯 |

正式题库由 `tools/convert_questions.py` 转换生成（字段映射见
`docs/bank-integration-and-recommend.md` §1.2），80 题全部转换成功、跳过 0 条。

> 正式题库两点现状需团队知晓：
> ① 80 题对应 **80 个不同考点**（零复用），同考点推荐需退到同章节兜底；
> ② `review_state` 全部为 `pending`，故 `original` 态需待核验完成后才会出现。
> 详见 `docs/bank-integration-and-recommend.md` §2.1。

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
score     ×= 0.62   （存在互斥术语冲突时，见 §4.5.2）
```

其中 `coverage` 用于衡量「查询词是否基本都出现在题干里」，
`penalty` 用于惩罚参数不一致的候选（详见下节）。

### 4.5 两道「参数 / 术语」闸门

#### 4.5.1 参数一致性（408 场景的关键）

408 计算题经常是「同一题型换参数」：Cache 容量从 64KB 换成 16KB，就是另一道题。
若参数不同却判成原题，会把错答案包装成「核验解析」给用户——这正是防幻觉红线要拦的情况。

因此抽取题干中的**数字 + 单位**（`64kb`、`64b`、`32位`、`4mb`）做集合比对：

- 查询参数被题目完全覆盖 → 参数一致率 1.0，不惩罚；
- 部分覆盖 → 按比例惩罚（最低 0.55）；
- **只要参数不完全一致，就绝不判 `original`**，直接降级为 `similar`。

#### 4.5.2 互斥术语冲突（80 题实测新增）

参数一致还不够。正式题库里有这种题：

```
OS009：页面走向 1,2,3,4,1,2,5,... 内存块数 3，采用 FIFO 置换，缺页次数？
OS010：页面走向 1,2,3,4,1,2,5,... 内存块数 3，采用 LRU  置换，缺页次数？
```

只差一个词、参数完全相同，互检得分 0.902（远高于原题阈值），
参数闸门拦不住，一旦判成原题就是把 LRU 的答案当成 FIFO 的核验解析。

`app/services/terms.py` 维护一张 408 互斥术语组表（页面置换 FIFO/LRU/OPT、
映射方式 直接映射/组相联/全相联、调度算法、TCP/UDP、各类排序与查找算法…）：

- 查询命中了组内某术语，而候选题干命中同组**另一个**术语 → 判定冲突；
- 冲突时分数 ×0.62，并且**禁止判 `original`**（`reason=term_conflict:<术语>`）；
- 候选题干同时提到组内多个术语（对比题）不判冲突，避免误伤正常提问。

修复后 OS009↔OS010 互检分降到 0.559（相似区），各自自检索仍为 1.0。
这层规则与题库规模无关，后续扩库不需要重新调参。

### 4.6 三态判定规则

```
① 综合分 ≥ original_threshold（0.72）
   或 强命中（查询词 ≥3 个 且 覆盖度 ≥0.9 且 参数一致 且 bm25 ≥0.2 且 分数 ≥ 阈值×0.85）
      ↓
      参数不一致？            → similar（reason: params_mismatch）
      review_state 非已核验？ → similar（reason: unverified:pending / disputed）
      否则                   → original
② 综合分 ≥ similar_threshold（0.45） → similar
③ 其余                              → miss
```

判定口径说明：

- **强命中规则**：BM25 的 idf 依赖题库规模，题库越小绝对分越低。加入一条与规模无关的兜底规则，
  保证「复制题干片段」这种最典型输入在任何规模的题库上都能稳定判为原题；
  同时它只放宽到阈值的 85%，调高阈值依然能让判定更保守。
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

### 4.8 实测数据（80 题正式题库）

当前 80 题全部为 `pending`，按 `downgrade` 策略原题一律降级为 `similar`，
所以下表重点看**分数**（分数决定「核验通过后会不会判原题」）：

| 场景 | 输入 | Top1 分数 | 当前判定 | 核验后判定 |
| --- | --- | --- | --- | --- |
| 整段复制题干 | COP006 完整题干 | 1.0000 | `similar`（`unverified:pending`） | `original` → COP006 |
| 轻微改写 | COP006 题干去掉「则」「字段」 | 0.9450 | `similar` | `original` → COP006 |
| 同参数不同问法 | 16KB / 32B / 2 路组相联求位数字段 | 0.9393 | `similar` | `original` → COP020 |
| 术语替换 | 把 OS009 的 FIFO 换成 LRU | 1.0000 | `similar` | `original` → OS010（术语闸门按词判定，替换后就是另一道题） |
| 关键短句 | `四路组相联，组号占 2 位` | 0.3226 | `miss` | `miss`（题库无该题，走 Agent 分支） |
| 完全无关 | `请说明量子计算机的基本原理` | 0.2834 | `miss` | `miss` |

两个值得说明的点：

- **0.9393 那条**分数很高但不是误判：COP020 就是 16KB / 32B / 2 路组相联的综合题，
  参数与查询完全一致，属于「同参数不同问法」，判原题是正确的；
- **短句判 `miss` 是刻意的**：`四路组相联，组号占 2 位` 只有 8 个字，
  不足以确认是哪一道题，硬判相似会给出误导性的参考题；交给 Agent 引导式解答更合适
  （正好覆盖 QA 的 Cache 基准「Prompt 必须指出错误」用例）。

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
通过 `raw_input` 传入，检索逻辑与文字输入完全一致；若 `raw_input` 为空则直接 `miss`。
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
└── tests/                       # 41 条用例
```

`/api/chat`（王圣杰）与 `/api/upload`（高一鹏）接入时，只需各自新增 `app/api/*.py`
并在 `main.py` 注册，与检索链路互不影响。

---

## 六、测试与验收

`backend` 目录下执行 `pytest`，当前 **41 条用例全部通过**，覆盖：

- 文本预处理：全角半角、题号剥离、分词降级、参数抽取
- 三态判定：原题（整段 / 片段 / 噪声）、相似（参数变式）、未命中（无关 / 空输入 / 空题库）
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
3. **未核验策略默认值**：当前 `downgrade`（保守）。正式题库 80 题**全部 `pending`**，
   在核验完成前原题命中恒为 0，演示会看不到「原题 + 核验解析」这条主线。
   两个选项：① 演示前由数据/QA 批量核验（推荐）；② 临时 `SEARCH_UNVERIFIED_POLICY=allow`，
   但 `review_state` 仍回 `pending`，前端必须打「待核验」标记，不得当作核验解析展示。
4. **`/api/recommend` 为新增接口**：需报备 TL 并录入 Apifox。
5. **考点建议归并**：80 题对应 80 个考点，同考点召不回同侪，现在靠「同章节」兜底。
   数据侧按考纲收敛到 ~30 个标准考点，推荐质量会明显提升。
6. **是否引入语义检索**：BM25 处理不了同义改写。若团队认为有必要，
   建议作为 P1 增量：在 BM25 召回后对 Top-N 做语义重排，而不是替换现有检索。

---

## 附录：题库交付 checklist（给林明亮）

1. 题目内容以真题 / MOOC / 原创变式为准，**出处不明确的不要编造年份与页码**，`source_ref` 可留空；
2. `review_state` 初始一律 `pending`，核验通过后改 `verified`，存疑改 `disputed`；
3. `question_id` 全局唯一且稳定（后续 `/api/chat` 与本地学习记录都会引用）；
4. 交付前本地跑一次 `pytest`，`GET /api/health` 的 `skipped` 应为空；
5. 同步更新 `source_table` 指向的《资料来源表》。
