-- ============================================================
-- 问径 · 408 智能体 —— 数据库模式（SQLite 方言）
-- 团队：你说的都队   责任人：周玘晖（后端 · 题库/检索/推荐）
-- 状态：设计稿（v1 线上以 JSON 文件 + LocalStorage 承载，本模式为
--       按作业要求的目标态数据库设计与 v2 迁移依据）
-- 日期：2026-11-06
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. subject 科目字典（数据结构 / 计算机组成原理 / 操作系统 / 计算机网络）
-- ------------------------------------------------------------
CREATE TABLE subject (
    subject_id   INTEGER      PRIMARY KEY,
    name         TEXT         NOT NULL UNIQUE
                       CHECK (name IN ('数据结构', '计算机组成原理', '操作系统', '计算机网络')),
    sort_no      INTEGER      NOT NULL DEFAULT 0          -- 展示排序
);

-- ------------------------------------------------------------
-- 2. knowledge_point 考点字典（归属科目，数据侧建议收敛到 ~30 个标准考点）
-- ------------------------------------------------------------
CREATE TABLE knowledge_point (
    kp_id        INTEGER      PRIMARY KEY,
    subject_id   INTEGER      NOT NULL REFERENCES subject(subject_id),
    name         TEXT         NOT NULL,
    UNIQUE (subject_id, name)                               -- 同科目内考点名唯一
);

-- ------------------------------------------------------------
-- 3. question 题目主表（字段对齐 backend/data/questions.json 的 16 项字段）
-- ------------------------------------------------------------
CREATE TABLE question (
    id           INTEGER      PRIMARY KEY,                 -- 代理主键
    question_id  TEXT         NOT NULL UNIQUE,             -- 业务主键 Q001 / DS001 …
    subject_id   INTEGER      NOT NULL REFERENCES subject(subject_id),
    chapter      TEXT         NOT NULL DEFAULT '',
    question_type TEXT        NOT NULL DEFAULT 'single_choice'
                       CHECK (question_type IN ('single_choice', 'multiple_choice',
                                                'fill_blank', 'short_answer',
                                                'calculation', 'comprehensive')),
    stem         TEXT         NOT NULL,                    -- 题干，检索主依据
    answer       TEXT,                                      -- 标准答案，如 'B'
    solution     TEXT,                                      -- 核验解析（防幻觉：仅 verified 展示）
    source_ref   TEXT,                                      -- 出处，不得编造
    review_state TEXT         NOT NULL DEFAULT 'pending'
                       CHECK (review_state IN ('pending', 'verified', 'disputed')),
    permission   TEXT         NOT NULL DEFAULT '原创',
    reviewer     TEXT,
    year         INTEGER,                                   -- 真题年份，出处不明保持 NULL
    question_no  TEXT,
    difficulty   INTEGER              CHECK (difficulty BETWEEN 1 AND 5),
    tags         TEXT         NOT NULL DEFAULT '[]',       -- JSON 数组；高频检索词可另行拆表
    created_at   TEXT         NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at   TEXT         NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_question_subject     ON question(subject_id);
CREATE INDEX idx_question_review      ON question(review_state);   -- 推荐接口只取 verified
CREATE INDEX idx_question_chapter     ON question(chapter);        -- 同章节兜底召回

-- 全文检索（BM25 由应用层倒排索引承担，此处为 v2 SQL 兜底方案）
CREATE VIRTUAL TABLE question_fts USING fts5(
    stem, solution, chapter, tags,
    content='question', content_rowid='id'
);

-- ------------------------------------------------------------
-- 4. question_option 选项子表（1:N，消除选项数组的非原子值）
-- ------------------------------------------------------------
CREATE TABLE question_option (
    option_id    INTEGER      PRIMARY KEY,
    question_id  INTEGER      NOT NULL REFERENCES question(id) ON DELETE CASCADE,
    label        TEXT         NOT NULL,                     -- 'A' / 'B' / …
    content      TEXT         NOT NULL,
    sort_no      INTEGER      NOT NULL DEFAULT 0,
    UNIQUE (question_id, label)
);

-- ------------------------------------------------------------
-- 5. question_kp 题目-考点 关联表（M:N，检索加权与同考点推荐依据）
-- ------------------------------------------------------------
CREATE TABLE question_kp (
    question_id  INTEGER      NOT NULL REFERENCES question(id) ON DELETE CASCADE,
    kp_id        INTEGER      NOT NULL REFERENCES knowledge_point(kp_id) ON DELETE CASCADE,
    PRIMARY KEY (question_id, kp_id)
);

CREATE INDEX idx_qkp_kp ON question_kp(kp_id);              -- 按考点反查题目（推荐主路径）

-- ------------------------------------------------------------
-- 6. review_record 核验流转历史（pending → verified / disputed 留痕）
-- ------------------------------------------------------------
CREATE TABLE review_record (
    review_id    INTEGER      PRIMARY KEY,
    question_id  INTEGER      NOT NULL REFERENCES question(id) ON DELETE CASCADE,
    old_state    TEXT         CHECK (old_state IN ('pending', 'verified', 'disputed')),
    new_state    TEXT         NOT NULL CHECK (new_state IN ('pending', 'verified', 'disputed')),
    reviewer     TEXT         NOT NULL,
    comment      TEXT,
    created_at   TEXT         NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_review_question ON review_record(question_id, created_at);

-- ------------------------------------------------------------
-- 7. app_user 用户（v1 匿名设备 UUID，对应前端 LocalStorage；预留账号扩展）
-- ------------------------------------------------------------
CREATE TABLE app_user (
    user_id      INTEGER      PRIMARY KEY,
    device_uuid  TEXT         UNIQUE,                       -- v1 唯一标识，匿名
    nickname     TEXT,                                      -- 预留：登录后昵称
    created_at   TEXT         NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ------------------------------------------------------------
-- 8. user_answer 做题记录（/api/recommend 的 done_question_ids 数据来源）
-- ------------------------------------------------------------
CREATE TABLE user_answer (
    record_id    INTEGER      PRIMARY KEY,
    user_id      INTEGER      NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    question_id  INTEGER      NOT NULL REFERENCES question(id) ON DELETE CASCADE,
    user_answer  TEXT,                                      -- 用户作答内容
    is_correct   INTEGER,                                   -- 0/1，引导式未判定可为 NULL
    mode         TEXT         NOT NULL DEFAULT 'practice'
                       CHECK (mode IN ('search', 'guided', 'recommend')),
    answered_at  TEXT         NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_answer_user_q ON user_answer(user_id, question_id);  -- 排除已做题目

-- ------------------------------------------------------------
-- 9. chat_session 答疑会话 + 10. chat_message 会话消息（/api/chat）
-- ------------------------------------------------------------
CREATE TABLE chat_session (
    session_id   INTEGER      PRIMARY KEY,
    user_id      INTEGER      REFERENCES app_user(user_id) ON DELETE SET NULL,  -- 允许匿名
    question_id  INTEGER      REFERENCES question(id) ON DELETE SET NULL,      -- 命中原题后关联
    title        TEXT,
    created_at   TEXT         NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at   TEXT         NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE chat_message (
    message_id   INTEGER      PRIMARY KEY,
    session_id   INTEGER      NOT NULL REFERENCES chat_session(session_id) ON DELETE CASCADE,
    role         TEXT         NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content      TEXT         NOT NULL,
    created_at   TEXT         NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_msg_session ON chat_message(session_id, message_id);

-- ------------------------------------------------------------
-- 11. search_log 搜题日志（三态判定留痕，支撑阈值校准复盘）
-- ------------------------------------------------------------
CREATE TABLE search_log (
    log_id       INTEGER      PRIMARY KEY,
    user_id      INTEGER      REFERENCES app_user(user_id) ON DELETE SET NULL,
    raw_input    TEXT         NOT NULL,
    input_type   TEXT         NOT NULL DEFAULT 'text' CHECK (input_type IN ('text', 'image')),
    match_type   TEXT         CHECK (match_type IN ('original', 'similar', 'miss')),
    matched_question_id INTEGER REFERENCES question(id) ON DELETE SET NULL,
    top_score    REAL,                                      -- Top1 综合分，校准复盘用
    created_at   TEXT         NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_search_time ON search_log(created_at);

-- ------------------------------------------------------------
-- 12. upload_document 上传文档（/api/upload，PDF/图片文本提取摘要）
-- ------------------------------------------------------------
CREATE TABLE upload_document (
    upload_id    INTEGER      PRIMARY KEY,
    user_id      INTEGER      REFERENCES app_user(user_id) ON DELETE SET NULL,
    file_name    TEXT         NOT NULL,
    file_type    TEXT         NOT NULL CHECK (file_type IN ('pdf', 'image')),
    file_size    INTEGER,
    extract_summary TEXT,                                   -- 提取文本的处理摘要
    created_at   TEXT         NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ============================================================
-- 初始化数据：四科字典
-- ============================================================
INSERT INTO subject (subject_id, name, sort_no) VALUES
    (1, '数据结构', 1),
    (2, '计算机组成原理', 2),
    (3, '操作系统', 3),
    (4, '计算机网络', 4);
