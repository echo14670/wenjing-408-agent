# 题库接入与同考点推荐 —— 交付说明

> 责任人：周玘晖（后端 · 题库接入 / 检索 / 推荐）
> 对应分支：`feature/backend-recommend`（基于 `feature/backend-question-bank`）
> 本文档对应阶段任务卡三项交付：**题库转换/加载方式、载入统计与阈值校准记录、推荐接口代码**。

---

## 一、题库转换与加载方式

### 1.1 加载链路（运行时）

```
data/questions.json（唯一事实来源）
   └─ QuestionStore.load()        app/services/question_store.py
        ├─ 兼容顶层对象 / 数组两种 JSON 结构
        ├─ 单条脏数据跳过并记录 skipped（不让整库加载失败）
        └─ 载入后构建两类内存索引：
             ├─ RetrievalIndex     检索用（倒排 + BM25，见 question-bank-design.md）
             └─ RecommendService   推荐用（考点倒排，见 §三）
```

- 后端无状态：题库只读、放内存，不接数据库；换 SQLite/ES 只需替换 `QuestionStore` 的实现。
- 热更新：替换 `data/questions.json` 后调用 `get_question_store().reload()` 并 `app.deps.reset()` 即可，无需重启进程。

### 1.2 字段转换工具（交付物 ①）

`backend/tools/convert_questions.py`，两种模式：

```bash
cd backend

# 模式一：载入统计 —— 核对题数与字段完整性（任务卡要求的「核对 80 题」就用它）
python tools/convert_questions.py stats data/questions.json

# 模式二：字段转换 —— 把数据同学交付的原始表转成标准 questions.json
python tools/convert_questions.py convert 源文件.csv data/questions.json
```

- 支持 JSON / CSV 源文件；CSV 列名中英文、大小写均可自动映射（`题号→question_id`、`考点→knowledge_points`、`核验状态→review_state` 等，完整别名表见文件头部注释）；
- 中文题型（单选/多选/简答…）与中文核验状态自动转枚举；
- 转换完成后立即输出字段完整性统计，数据质量问题（必填缺失、id 重复、科目/题型非法）当场暴露。

## 二、载入统计与阈值校准记录（交付物 ②）

### 2.1 载入统计（当前样例题库 16 题）

> ⚠️ 80 题正式题库文件尚未同步到本地。文件到位后执行上面 `stats` 命令即可出正式统计，
> 本节先以样例库跑通全流程并留档。

```
有效题数: 16        跳过: 0
字段完整性: 必填字段（question_id/subject/stem）100%；除 year（0%）外全部 100%
科目分布: 计组 6 / 数据结构 4 / 操作系统 3 / 计网 3
核验状态: verified 14 / pending 1 / disputed 1
考点覆盖: 17 个考点，0 题无考点
健康问题: 无（无重复 id、无非法枚举）
```

### 2.2 阈值校准记录

`backend/tools/calibrate_threshold.py`，逐题自检索并记录分数分布，结果落盘
`docs/threshold-calibration.md`（交付物）。当前样例库结论：

| 指标 | 数值 |
| --- | --- |
| 自检索命中 | 16/16（100%） |
| 自检索得分 | 最低 0.9731，中位 1.0 |
| 最高干扰分（同库他题） | 0.6394 |
| 改写查询得分（Cache 基准） | 0.8353 / 0.8134 |
| 建议 original 阈值 | **0.81**（≤ 最弱改写样本 0.8134，避免误杀真人输入） |
| 建议 similar 阈值 | 0.38（现值 0.45 更保守，可维持） |

当前生效配置 `original=0.72 / similar=0.45` 位于安全区间
（0.64 < 0.72 < 0.81 < 1.0），无需调整；**80 题库到位后必须重跑校准**：

```bash
python tools/calibrate_threshold.py data/questions.json \
    --report ../docs/threshold-calibration.md \
    --probe "四路组相联，组号占 2 位"    # 至少附一条真实改写查询
```

## 三、同考点推荐接口（交付物 ③）

### 3.1 语义（对齐任务卡要求）

1. 取当前题的 `knowledge_points`，召回共享 ≥1 个考点的候选；
2. **排除当前题**；
3. **只返回「已核验 且 不在 done_question_ids」的题**（做过的题由前端 LocalStorage 记录、随请求传入，后端无状态不落库）；
4. 排序：共享考点数多者优先，同分按 question_id 稳定排序；
5. **无合适候选 → 返回空数组**，不塞未核验题凑数（与检索三态的保守风格一致）。

### 3.2 接口定义（⚠️ 新增接口，合入前需 TL 报备并同步 Apifox）

`POST /api/recommend`

```jsonc
// 请求
{
  "question_id": "Q001",
  "done_question_ids": ["Q002"],   // 可选，前端本地做过的题
  "top_k": 5                        // 可选，默认 5，上限 10
}
// 响应（questions 为空数组即「无合适候选」）
{
  "questions": [
    { "question_id": "Q004", "subject": "...", "stem": "...",
      "options": [], "answer": "...", "solution": "...",
      "review_state": "verified", "chapter": "...", "source_ref": "..." }
  ]
}
```

出参复用 `/api/search` 的 `question_data` 结构；当前题不存在、无考点信息同样返回空数组。

### 3.3 代码位置

| 文件 | 职责 |
| --- | --- |
| `app/services/recommend.py` | 考点倒排 + 筛选排序，纯函数可单测 |
| `app/api/recommend.py` | 路由与出入参强校验（Pydantic） |
| `app/deps.py` | `get_recommend_service`：与检索共享同一份内存题库 |
| `tests/test_recommend.py` | 服务层 6 条用例 |
| `tests/test_recommend_api.py` | 接口层 7 条用例（真实题库 + 可控小题库） |

### 3.4 验证

```bash
cd backend && pytest          # 53 passed（含检索原有用例）
uvicorn main:app              # 冒烟：Q001 推荐 → Q002/Q004；
                              # done 全部候选后 → []；不存在题 → []；top_k=99 → 422
```

## 四、待办

1. **80 题正式题库**：文件到位后执行 §1.2 stats 出正式载入统计、§2.2 重跑校准；
2. `/api/recommend` 契约报备 TL 并录入 Apifox；
3. 前端在答题落库时同步维护 `done_question_ids` 并随推荐请求传入。
