# 题库接入与同考点推荐 —— 交付说明

> 责任人：周玘晖（后端 · 题库接入 / 检索 / 推荐）
> 对应分支：`feature/backend-recommend`（基于 `feature/backend-question-bank`）
> 对应任务卡：题库接入（80 题 → v1.1 81 题）+ 检索阈值校准 + 同考点推荐接口
>
> 说明：本文记录基于 v1.0（80 题）的接入过程；v1.1（81 题）已用同一套工具转换接入，
> 阈值按 v1.1 重新校准，见 `docs/threshold-calibration.md`。

---

## 一、题库转换与加载方式

### 1.1 数据从哪来

正式题库由林明亮（数据角色）交付，源文件在腾讯文档共享库
「stage3 · 现场编程 / 林明亮-题库 / questions.json」，v1.0 共 **80 题**（四科各 20），v1.1 扩为 **81 题**（新增 OS021）。
本仓库落位：

| 文件 | 用途 | 说明 |
| --- | --- | --- |
| `backend/data/questions.json` | **正式题库（80 题）** | 服务运行时加载的唯一事实来源 |
| `backend/data/questions.sample.json` | 样例 / 回归基线（16 题） | 保留已核验的 Cache 基准题 Q001，供单测与三态回归 |
| `backend/data/questions_80_raw.json` | 原始交付件留档 | 转换输入，保留追溯能力 |

### 1.2 字段转换（交付物 ①）

数据同学交付的字段与内部模型不一致，`backend/tools/convert_questions.py` 负责转换：

| 源字段 | 内部字段 | 处理 |
| --- | --- | --- |
| `type` | `question_type` | 中文/英文题型统一成枚举（单选→`single_choice`） |
| `analysis` | `solution` | 解析正文 |
| `knowledge_point`（字符串） | `knowledge_points`（数组） | 单值转数组，顿号/分号/逗号分隔自动拆 |
| `options`（对象 `{"A": "..."}`） | `options`（数组 `["A. ...", ...]`） | 按字母序展开并补选项标号，前端可直接渲染 |
| `review_state`（中文） | `review_state`（枚举） | 待核验→`pending`、已核验→`verified`、有争议→`disputed` |
| `permission` / `reviewer` / `question_no` | 同名扩展字段 | 版权口径与核验人，入库用于追溯，不外泄到接口 |
| `meta`（版本/作者/批次） | 顶层 `meta` | 原样保留，便于追溯交付批次 |

```bash
cd backend

# 模式一：载入统计（核对题数与字段完整性）
python tools/convert_questions.py stats data/questions.json

# 模式二：字段转换（源表 -> 标准 questions.json）
python tools/convert_questions.py convert data/questions_80_raw.json data/questions.json
```

CSV / JSON 均可作为源；CSV 列名中英文、大小写自动映射（`题号→question_id`、`考点→knowledge_points`、
`核验状态→review_state` 等），转换后立刻输出同一份统计，数据问题当场暴露。
本次转换结果：**80 题全部转换成功，跳过 0 条**。

### 1.3 运行时加载链路

```
data/questions.json（唯一事实来源）
   └─ QuestionStore.load()            app/services/question_store.py
        ├─ 兼容顶层对象 / 数组两种 JSON 结构
        ├─ 单条脏数据跳过并记入 skipped（不让整库加载失败）
        └─ 载入后构建内存索引：
             ├─ RetrievalIndex      检索用（字段加权倒排 + BM25）
             └─ RecommendService    推荐用（考点 / 章节倒排）
```

后端无状态：题库只读、常驻内存，不接数据库；换 SQLite / ES 只需替换 `QuestionStore` 实现。
热更新：替换 JSON 后 `get_question_store().reload()` + `app.deps.reset()`，无需重启进程。

## 二、载入统计（80 题正式题库）

```
$ python tools/convert_questions.py stats data/questions.json
有效题数: 80        跳过: 0

字段完整性（非空率）
  ✓ question_id        80/80 (100%)  必填
  ✓ subject            80/80 (100%)  必填
  ✓ chapter            80/80 (100%)
  ✓ question_type      80/80 (100%)
  ✓ stem               80/80 (100%)  必填
  ✓ options            78/80  (98%)
  ✓ answer             80/80 (100%)
  ✓ solution           80/80 (100%)
  ✓ source_ref         80/80 (100%)
  ✓ review_state       80/80 (100%)
  ✓ knowledge_points   80/80 (100%)
  ✗ year                0/80   (0%)
  ✓ difficulty         80/80 (100%)
  ✗ tags                0/80   (0%)
  ✓ permission         80/80 (100%)
  ✓ reviewer           80/80 (100%)
  ✗ question_no         0/80   (0%)

科目分布: 数据结构 20 / 计算机组成原理 20 / 操作系统 20 / 计算机网络 20
题型分布: 单选 78 / 综合 2
核验状态: 待核验 80
考点覆盖: 80 个考点，0 题无考点
健康问题: 无（无重复 id、无非法枚举、无缺题干）
```

三个 0% 字段都**不是缺陷**：

- `year` / `question_no` 全空 —— 本批 80 题均为原创或变式，未直接采用真题原文，
  这正是版权口径（`permission`：原创 76 / 需变式 4）要求的；
- `tags` 未使用 —— 检索已用 `knowledge_points` + `chapter` 加权，tags 留作后续扩展；
- `options` 98% —— 缺失的 2 题是综合题（COP020、NET020），本来就没有选项。

### 2.1 两个必须让团队知道的数据结论

| 结论 | 数据 | 影响 | 建议 |
| --- | --- | --- | --- |
| **考点零复用** | 80 题 → 80 个不同 `knowledge_point` | 严格「同考点推荐」对每题都返回空，功能等于不可用 | 推荐已做两级召回（考点→章节）兜底；数据侧建议按教材考纲归并到 ~30 个标准考点 |
| **全部待核验** | `review_state` 100% = `pending` | 三态里的 `original` 永远不出现，所有命中都降级为 `similar`（守住「未核验不得当核验解析」红线） | 演示前由数据/QA 批量核验并置 `verified`；或临时用 `SEARCH_UNVERIFIED_POLICY=allow` 演示（见 §3.4） |

## 三、检索阈值校准（交付物 ②）

校准工具：`backend/tools/calibrate_threshold.py`，完整记录见 **`docs/threshold-calibration.md`**。

方法：把每道题的完整题干当作查询自检索一次，记录「自身得分」与「同库他题最高分（干扰分）」；
再用「截断到题干前 60%」模拟 OCR 只识别一半的输入；另加无关查询验证噪声。

```bash
python tools/calibrate_threshold.py data/questions.json \
    --report ../docs/threshold-calibration.md \
    --negative "今天天气怎么样" --negative "请说明量子计算机的基本原理"
```

| 指标 | 80 题正式题库 |
| --- | --- |
| 自检索命中 | **80/80（100%）** |
| 自检索得分 | 最低 0.9383，中位 1.0 |
| 干扰分（除自身外最高） | 最大 **0.6305**，中位 0.3967，P90 0.5771 |
| 截断改写（前 60% 题干） | 77/77 命中自身，最低 0.55，中位 1.0 |
| 无关查询最高分 | 0.3055（< similar 阈值 0.45，不会误判成相似题） |
| **阈值安全区间** | **下界 0.65 < original < 上界 0.91** |
| 当前配置 original=0.72 | ✓ 落在区间内；截断改写命中率 97% |
| 建议值（区间中点） | 0.78 |

**结论：保持 `original=0.72`、`similar=0.45` 不变。**
0.72 距干扰上界 0.6305 有 0.09 余量，距自检索下界 0.9383 有 0.21 余量，两侧都安全；
调到 0.78 更保守但会牺牲改写容忍度，收益不明显。**阈值改动需重跑本校准并全量回归。**

### 3.1 校准过程中修掉的两个真问题

正式题库比样例库「刁钻」，一上量就暴露了两个缺陷，都已修复并加了用例：

**(1) 互斥术语冲突** —— OS009（FIFO）与 OS010（LRU）题干只差一个词，
互检得分 **0.902**，参数（页面序列、内存块数）完全一致，会被判成原题，
等于把 LRU 的答案当作 FIFO 的「核验解析」给出，直接踩防幻觉红线。

修复：新增 `app/services/terms.py`，维护 408 互斥术语组（FIFO/LRU/OPT、直接映射/组相联/全相联、
先来先服务/短作业优先/时间片轮转、TCP/UDP、各类排序算法…）。查询命中的术语在候选题干里缺席时，
分数乘 0.62 且**禁止判 original**。修复后 OS009↔OS010 互检降到 **0.559**（相似区），
各自自检索仍为 1.0。这是一层与题库规模无关的规则，扩库时无需重调。

**(2) 数字与字母粘连** —— 归一化去标点后「块数 3，FIFO 置换」变成 `3fifo`，
jieba 把它当一个词，`fifo` 这个关键术语匹配不上任何题，还会抽出错误参数 `3fif`。
修复：数字后缀只认白名单单位（kb/mb/bit/bps…），分词时把「数字+字母」粘连 token 拆开并保留原 token。

## 四、同考点推荐接口（交付物 ③）

### 4.1 语义

1. **召回两级**：同考点（共享 ≥1 个 `knowledge_point`）→ 无候选时退到**同章节**；
   章节为空的题不参与第二级，避免「空章节」把全库串起来；
2. **排除当前题**，并排除前端传入的 `done_question_ids`（前端 LocalStorage 记录，后端无状态不落库）；
3. **优先返回「未做过 + 已核验」**；同层无已核验题时，默认**返回空**——
   只有请求显式带 `include_unverified=true` 才用未核验题兜底，并回 `notice` 提醒前端打「待核验」标记；
4. 排序：共享考点数多者优先 → 题号，保证结果稳定可复现；
5. **两级都没有合适候选 → 空数组**，不硬凑。

> 为什么加章节级：正式题库 80 题对应 80 个考点，严格同考点对每题都是空结果（见 §2.1）。
> 章节级是数据现状下的必要兜底，且仍满足「排除当前题 + 只推已核验 + 空结果兜底」的验收口径。

### 4.2 接口定义（⚠️ 新增接口，合入前需 TL 报备并同步 Apifox）

`POST /api/recommend`

```jsonc
// 请求
{
  "question_id": "COP006",
  "done_question_ids": ["OS001"],     // 可选：前端本地做过的题
  "top_k": 5,                          // 可选：默认 5，上限 10
  "include_unverified": false          // 可选：演示期可置 true 让待核验题兜底
}

// 响应
{
  "questions": [
    { "question_id": "COP005", "subject": "计算机组成原理", "chapter": "存储器层次结构",
      "stem": "...", "options": [], "answer": "...", "solution": "...",
      "review_state": "pending", "source_ref": "..." }
  ],
  "scope": "chapter",                  // knowledge_point | chapter | none
  "notice": ""                         // 兜底到未核验题时的提示文案
}
```

出参 `questions` 复用 `/api/search` 的 `question_data` 结构，前端渲染逻辑可直接复用；
`scope` 供前端切换标题（「同考点练习」/「同章节练习」）。

### 4.3 代码位置

| 文件 | 职责 |
| --- | --- |
| `app/services/recommend.py` | 考点 / 章节倒排 + 筛选排序，纯逻辑可单测 |
| `app/api/recommend.py` | 路由与出入参强校验（Pydantic） |
| `app/services/terms.py` | 互斥术语组（检索与推荐共用） |
| `app/deps.py` | `get_recommend_service`：与检索共享同一份内存题库 |
| `tests/test_recommend.py` | 服务层用例（含两级召回、未核验兜底） |
| `tests/test_recommend_api.py` | 接口层用例（正式题库 + 可控小题库） |

### 4.4 实测（起服务连 80 题正式题库）

| 请求 | 结果 |
| --- | --- |
| `{"question_id":"COP006"}` | `[]`，`scope=none` —— 同考点无同侪、同章节无已核验题，按红线返回空 |
| `{"question_id":"COP006","include_unverified":true}` | `scope=chapter`，返回 COP005 / COP007 / COP008 / COP016，附「尚未核验」notice |
| `{"question_id":"Q99999"}` | `[]` |
| `{"question_id":"COP006","top_k":99}` | `422`（超出上限） |

## 五、验证与回归

```bash
cd backend
pytest                       # 59 passed
uvicorn main:app             # GET /api/health -> questions=80, indexed=80, tokenizer=jieba
```

- 单测覆盖：三态判定、参数一致性、术语冲突、数字粘连、两级召回、未核验兜底、入参校验；
- 样例库（16 题）保留 Cache 基准题，作为「原题命中 + 已核验解析」的回归基线；
- 正式题库（80 题）用于载入统计、阈值校准与推荐实测。

## 六、待 TL 拍板 / 后续

1. **`/api/recommend` 是新增接口**，需报备 TL 并录入 Apifox（现契约只有 search / chat / upload）；
2. **80 题全部待核验**：演示前需完成核验，否则 `/api/search` 只返回 `similar`。
   临时演示开关：`SEARCH_UNVERIFIED_POLICY=allow`（此时 `question_data.review_state` 仍回 `pending`，
   前端应打「待核验」标记，不得当作核验解析展示）；
3. **考点建议归并**：80 题 80 个考点，建议数据侧按考纲收敛到 ~30 个，推荐质量会明显提升；
4. **Cache 基准题（Q001）不在 80 题内**：QA 的「四路组相联，组号占 2 位」这类输入现落在 `miss`，
   由 Agent 链路（王圣杰）按引导模式解答，正好覆盖「未命中」路径；若希望走「原题命中」，
   需要数据侧补一道同参数题或把基准题正式收录。
