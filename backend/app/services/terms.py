"""408 互斥术语组：用于识别「题干几乎一样但改了一个关键术语」的变式题。

为什么需要这一层
----------------
题库里大量存在「同一题干换算法」的题，例如：

  OS009：页面走向 1,2,3,4,1,2,5,... 内存块数 3，采用 **FIFO** 置换，缺页次数？
  OS010：页面走向 1,2,3,4,1,2,5,... 内存块数 3，采用 **LRU** 置换，缺页次数？

两句只差一个词，BM25 + 覆盖度会给到 0.90 的高分，参数（数字/单位）完全一致，
参数一致性校验也拦不住。但它们是两道不同的题（答案可以不同），
若判成 original 就会把另一道题的答案当作「核验解析」展示出去 —— 直接踩防幻觉红线。

做法
----
维护一张「互斥术语组」表：同一组内的术语互斥（一道题只可能考其中一个）。
- 查询命中了组内某术语；
- 候选题干命中了同组内**另一个**术语；
→ 判定为术语冲突，压低分数并禁止判 original。

保守起见只做「冲突即降级」，不做「冲突即 miss」：相关题仍可作为相似题参考。
"""

from __future__ import annotations

import re

# 每组内的术语互斥。术语用归一化后的小写形式匹配：
# 纯 ASCII 术语按词边界匹配（避免 lru 命中 longrunning 之类），中文按子串匹配。
TERM_GROUPS: tuple[tuple[str, ...], ...] = (
    # 页面置换算法
    ("fifo", "lru", "opt", "lfu", "clock", "先进先出", "最近最久未使用", "最佳置换", "时钟置换"),
    # Cache / 主存 映射方式
    ("直接映射", "直接相联", "组相联", "全相联", "全相联映射"),
    # 进程调度算法
    ("先来先服务", "fcfs", "短作业优先", "sjf", "时间片轮转", "优先级调度", "高响应比", "多级反馈队列"),
    # 传输层协议
    ("tcp", "udp"),
    # 数据交换方式
    ("电路交换", "报文交换", "分组交换"),
    # 进程 vs 线程
    ("多进程", "多线程"),
    # 死锁处理策略
    ("死锁预防", "死锁避免", "银行家算法", "死锁检测", "死锁解除"),
    # 查找算法
    ("顺序查找", "折半查找", "二分查找", "分块查找", "哈希查找", "散列查找"),
    # 内部排序算法
    (
        "直接插入排序", "希尔排序", "冒泡排序", "快速排序", "简单选择排序",
        "堆排序", "归并排序", "基数排序",
    ),
    # 树的形态
    ("二叉排序树", "二叉搜索树", "avl", "红黑树", "b 树", "b+ 树", "b树", "b+树"),
    # 图的最短路径 / 最小生成树算法
    ("dijkstra", "floyd", "prim", "kruskal"),
    # 可靠传输协议
    ("停等协议", "后退 n 帧", "选择重传", "gbn", "sr"),
    # 介质访问控制
    ("csma/cd", "csma/ca", "令牌环", "令牌传递"),
    # 存储管理方式
    ("分页", "分段", "段页式"),
    # I/O 控制方式
    ("程序查询", "程序中断", "dma", "通道"),
    # 地址 / 子网
    ("ipv4", "ipv6"),
    # 编码 / 校验
    ("奇校验", "偶校验", "海明码", "crc", "循环冗余"),
)

# 预编译：ASCII 术语用字母边界，中文用子串。
_ASCII_RE = re.compile(r"^[a-z0-9+/ ]+$")


def _compile(term: str) -> re.Pattern[str]:
    if _ASCII_RE.match(term):
        # 允许术语里带空格（"b 树" 不算 ASCII，这里只处理纯英数符号）
        return re.compile(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])")
    return re.compile(re.escape(term))


_COMPILED: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (term, _compile(term)) for group in TERM_GROUPS for term in group
)


def matched_terms(normalized_text: str) -> set[str]:
    """返回文本命中的互斥术语集合（已归一化的小写文本作为输入）。"""
    if not normalized_text:
        return set()
    return {term for term, pattern in _COMPILED if pattern.search(normalized_text)}


def conflicting_terms(query_text: str, doc_text: str) -> set[str]:
    """查询命中的术语在候选文本里缺失的那些（缺失即视为冲突）。

    只比较「查询有、候选没有」的方向：候选同时讲 FIFO 和 LRU（对比题）时
    不会与任何单算法查询冲突，这是刻意的宽松处理。
    """
    query_terms = matched_terms(query_text)
    if not query_terms:
        return set()
    doc_terms = matched_terms(doc_text)
    if not doc_terms:
        # 候选题干完全没提这类术语（例如纯数字计算题），不判定为冲突，
        # 否则会把「正常改写提问」误伤成冲突。
        return set()
    return query_terms - doc_terms
