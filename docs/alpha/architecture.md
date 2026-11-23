# 系统架构图（Alpha · 对应实际版本）

> 维护：叶凯乐（TL）｜ 更新：2026-11-13 ｜ 对应主干 81 题 v1.1、5 接口

## 一、系统交互架构

```mermaid
flowchart LR
    Student((学生))
    Front[浏览器前端<br/>Vue 3 + Vite]
    Local[(本地存储<br/>history:v1 / materials:v1)]
    Back[后端 FastAPI<br/>search/chat/upload/recommend/health]
    Tools[计算工具<br/>Cache 求解器等]
    DB[(JSON 题库<br/>81 题内存索引)]
    LLM[云端大模型<br/>OpenAI 兼容]

    Student <--> Front
    Front <--> Local
    Front <-->|"题干/会话/切片"| Back
    Back <-->|"内存检索"| DB
    Back <-->|"调用"| Tools
    Back <-->|"Prompt+上下文"| LLM
    LLM -->|"回复/引用"| Back
    Back -->|"reply/tool_result/citations"| Front
```

## 二、Agent 链路

```mermaid
flowchart TD
    A[输入题干] --> B[检索: jieba + BM25 + 参数校验]
    B --> C{三态判定}
    C -->|original| D[题库核验解析]
    C -->|similar| E[相似题仅展示]
    C -->|miss| F[Agent 解题分支]
    F --> G[拼 Prompt<br/>引导模式不注入答案]
    G --> H[调云端 LLM]
    H --> I[工具计算]
    I --> J[防泄底拦截 + 冲突并列]
    J --> K[reply/tool_result/citations]
```

## 三、数据存储

```mermaid
flowchart LR
    Q[(questions.json<br/>81 题)] -->|启动载入| M[内存检索索引]
    S[(questions.sample.json<br/>16 题回归基线)] -->|单测| M
    H[(history:v1)] --- B[浏览器 LocalStorage]
    M2[(materials:v1)] --- B
    B -->|context_chunks 透传| API[后端接口]
```

## 四、核心设计原则

1. 后端无状态：不保存用户数据，历史/资料在浏览器本地，随请求透传。
2. 题库只读：JSON 文件启动载入内存，检索用内存索引。
3. 无状态切片：个人资料切片随 `context_chunks` 发送，后端不落库。
