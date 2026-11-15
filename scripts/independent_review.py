"""龚巍斌的 26 题独立复算。仅读题库，不调用 Agent 或题库生成工具。

此脚本核对冻结快照；题库变化时必须重新阅读题目，不能沿用旧审核结论。
已知内容问题使默认退出码为 1；--allow-known-issues 仅用于阶段留档。
"""
from __future__ import annotations

import argparse
import hashlib
import heapq
import ipaddress
import itertools
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK_SHA256 = "56dea5485d5e0c7c74c62c64b1a2687a3a52d38700737ddfb6410fe7a52b958f"
IDS = ["COP005", "COP006", "COP007", "OS008", "OS009", "OS010", "OS021",
       "NET006", "NET007", "NET008", "NET020", "DS001", "DS010", "DS016", "COP020", "OS011",
       "DS002", "DS004", "DS006", "COP001", "COP003", "COP009", "OS004", "OS006", "NET002", "NET011"]


def pages(policy: str) -> dict:
    sequence = [1, 3, 2, 4, 1, 3, 5, 1, 3, 2, 4, 5]
    resident, entered, last_used, trace = [], {}, {}, []
    faults = 0
    for index, page in enumerate(sequence):
        fault = page not in resident
        evicted = None
        if fault:
            faults += 1
            if len(resident) == 3:
                if policy == "FIFO":
                    evicted = min(resident, key=entered.get)
                elif policy == "LRU":
                    evicted = min(resident, key=last_used.get)
                else:
                    future = sequence[index + 1:]
                    evicted = max(resident, key=lambda p: future.index(p) if p in future else math.inf)
                resident.remove(evicted)
            resident.append(page)
            entered[page] = index
        last_used[page] = index
        trace.append({"page": page, "fault": fault, "evicted": evicted, "resident": resident.copy()})
    return {"faults": faults, "trace": trace}


def bank_safety() -> dict:
    available = [1, 0, 1]
    maximum = [[1, 1, 1], [1, 1, 1], [2, 1, 2], [2, 1, 1]]
    allocation = [[0, 1, 0], [1, 0, 1], [0, 1, 1], [1, 0, 0]]
    need = [[m - a for m, a in zip(ms, alloc)] for ms, alloc in zip(maximum, allocation)]
    sequences = []
    for order in itertools.permutations(range(4)):
        work = available.copy()
        for pid in order:
            if any(n > w for n, w in zip(need[pid], work)):
                break
            work = [w + a for w, a in zip(work, allocation[pid])]
        else:
            sequences.append([f"P{pid}" for pid in order])
    return {"need": need, "safe_sequences": sequences}


def stack_possible(order) -> bool:
    stack, pos = [], 0
    for target in order:
        while (not stack or stack[-1] != target) and pos < 5:
            pos += 1
            stack.append(pos)
        if not stack or stack.pop() != target:
            return False
    return True


def crc_remainder(value: int, polynomial: int) -> int:
    while value.bit_length() >= polynomial.bit_length():
        value ^= polynomial << (value.bit_length() - polynomial.bit_length())
    return value


def calculate() -> dict:
    out = {}
    def add(qid, answer, working, metrics=None, status="pass"):
        out[qid] = {"independent_answer": answer, "working": working,
                    "metrics": metrics or {}, "conclusion": status}

    # 字段长度按题面单位独立求解，不导入 app.services.agent_tools。
    add("COP005", "A", "1 GiB=2^30 字节；64 KiB/64 B=1024 行，偏移6、行索引10、Tag14。",
        {"address_bits": 30, "offset_bits": 6, "index_bits": 10, "tag_bits": 30 - 6 - 10})
    add("COP006", "A", "32 KiB/64 B/4=128 组；偏移6、组索引7、Tag=32-6-7=19。",
        {"groups": 32768 // 64 // 4, "fields": [6, 7, 19]})
    average = .95 * 1 + .05 * (1 + 100)
    assert math.isclose(average, 6)
    add("COP007", "B", "串行访问未命中需1+100周期，加权平均为6周期。", {"average_cycles": average})
    safety = bank_safety()
    assert ["P0", "P1", "P3", "P2"] in safety["safe_sequences"]
    assert all(order[0] == "P0" for order in safety["safe_sequences"])
    add("OS008", "A", "逐项计算Need，再枚举24个进程序列；首个可满足者只能是P0，A序列安全。", safety)
    for qid, policy, expected, answer in [("OS009", "FIFO", 9, "A"), ("OS010", "LRU", 10, "B"), ("OS021", "OPT", 7, "A")]:
        result = pages(policy)
        assert result["faults"] == expected
        add(qid, answer, f"独立模拟12次访问，{policy} 缺页{expected}次；轨迹见metrics。", result)
    remainder = crc_remainder(int("10110", 2) << 4, int("10011", 2))
    assert remainder == 15 and crc_remainder((int("10110", 2) << 4) | remainder, int("10011", 2)) == 0
    add("NET006", "B", "补4零后做多项式异或长除法，余数1111；拼接发送帧后余数为0。", {"crc": f"{remainder:04b}"})
    subnet = list(ipaddress.ip_network("192.168.10.0/24").subnets(new_prefix=26))[0]
    add("NET007", "A", "4个等长子网需借2位；/26共64地址，普通子网可用62主机。", {"usable_hosts": subnet.num_addresses - 2})
    aggregate = list(ipaddress.collapse_addresses([ipaddress.ip_network("172.16.14.0/24"), ipaddress.ip_network("172.16.15.0/24")]))
    assert str(aggregate[0]) == "172.16.14.0/23" and len(aggregate) == 1
    add("NET008", "A", "两个对齐且连续的/24合并为172.16.14.0/23。", {"aggregate": str(aggregate[0])})
    allocations = [ipaddress.ip_network("200.10.16.0/23"), ipaddress.ip_network("200.10.18.0/24"), ipaddress.ip_network("200.10.19.0/25")]
    assert all(n.num_addresses - 2 >= hosts for n, hosts in zip(allocations, [500, 250, 120]))
    add("NET020", "与综合题答案一致", "A/B/C分别/23、/24、/25；B网络18.0、广播18.255、可用18.1—18.254。",
        {"allocations": [str(n) for n in allocations], "B_broadcast": str(allocations[1].broadcast_address),
         "B_first": str(allocations[1].network_address + 1), "B_last": str(allocations[1].broadcast_address - 1)})
    counts = {}
    for n in [1, 2, 4, 8, 16]:
        i, loops = 1, 0
        while i <= n:
            i *= 2
            loops += 1
        assert loops == math.floor(math.log2(n)) + 1
        counts[n] = loops
    add("DS001", "A", "复杂度正确；循环体实际执行floor(log2 n)+1次，原解析少了1（如n=1执行1次）。", counts, "explanation_revision")
    weights, merged = [2, 3, 5, 7], []
    heapq.heapify(weights)
    while len(weights) > 1:
        pair_sum = heapq.heappop(weights) + heapq.heappop(weights)
        merged.append(pair_sum)
        heapq.heappush(weights, pair_sum)
    assert sum(merged) == 32
    add("DS010", "B", "哈夫曼合并代价5+10+17=32，即WPL。", {"merge_costs": merged, "WPL": sum(merged)})
    slots, probes = [None] * 11, []
    for key in [32, 45, 34, 12, 79]:
        index, checked = key % 11, 1
        while slots[index] is not None:
            index = (index + 1) % 11
            checked += 1
        slots[index] = key
        probes.append(checked)
    asl = sum(probes) / len(probes)
    assert probes == [1, 1, 2, 3, 3] and asl == 2
    add("DS016", None, "正确ASL=2.0，无正确选项；79从地址2探测2、3、4共3次，原解析误计4次。",
        {"slots": slots, "successful_probes": probes, "ASL": asl}, "answer_error")
    blocks = [address // 32 for address in [0, 32, 0, 64, 32, 0]]
    resident, hits = {}, 0
    for block in blocks:
        group = block % 256
        entries = resident.setdefault(group, [])
        if block in entries:
            hits += 1
        else:
            assert len(entries) < 2  # 此序列没有替换，不依赖替换算法。
            entries.append(block)
    assert hits == 3
    add("COP020", "与综合题答案一致", "地址字段5/8/19；块号0,1,0,2,1,0，组号同序，无替换，命中3次/50%。",
        {"fields": [5, 8, 19], "blocks": blocks, "hits": hits, "hit_rate": hits / len(blocks)})
    page, offset = divmod(0x5F40, 4096)
    assert page == 5 and offset == 0xF40
    add("OS011", "A", "按4096做整除与取模，页号5、页内偏移0xF40。", {"page": page, "offset": hex(offset)})
    moves = list(range(8, -1, -1))
    assert sum(moves) / len(moves) == 8 / 2
    add("DS002", "A", "对n+1个位置平均：(n+...+0)/(n+1)=n/2；原解析(1/n+1)应写1/(n+1)。",
        {"n": 8, "moves": moves, "average": sum(moves) / len(moves)}, "explanation_revision")
    orders = [[3, 2, 1, 4, 5], [5, 4, 3, 2, 1], [4, 3, 5, 1, 2], [2, 3, 5, 4, 1]]
    possible = [stack_possible(order) for order in orders]
    assert possible == [True, True, False, True]
    add("DS004", "C", "按顺序压栈并贪心弹出所需元素，只有C无法实现。", {"A_to_D_possible": possible})
    pattern, nxt = "ababa", [0]
    for j in range(1, len(pattern)):
        prefix = pattern[:j]
        border = max([k for k in range(1, len(prefix)) if prefix[:k] == prefix[-k:]] or [0])
        nxt.append(border + 1)
    assert nxt == [0, 1, 1, 2, 3]
    add("DS006", "A", "按题目1起始、next[1]=0的经典未优化next定义，逐前缀枚举真前后缀。", {"next": nxt})
    add("COP001", "A", "8位补码最小-2^7=-128、最大2^7-1=127。", {"range": [-128, 127]})
    add("COP003", "A", "10000010二进制为130，减去题面给定偏置127，实际指数3。", {"exponent": int("10000010", 2) - 127})
    add("COP009", None, "16位无法容纳3个6位地址（仅地址就18位），原解析16-18=4错误；最多63还额外假设保留一个扩展码，题干未给出。",
        {"instruction_bits": 16, "three_address_bits": 3 * 6, "remaining_opcode_bits": 16 - 18}, "invalid_question")
    completion, elapsed = [], 0
    for duration in sorted([6, 2, 8, 3]):
        elapsed += duration
        completion.append(elapsed)
    add("OS004", "A", "同时到达时按2、3、6、8执行，完成时刻2、5、11、19，平均周转9.25分钟。",
        {"completion": completion, "average": sum(completion) / 4})
    add("OS006", "A", "互斥信号量初值1，进入临界区前wait/P取得许可，退出时post/V释放。", {"entry_operation": "P(mutex)"})
    capacity = 3000 * math.log2(1 + 10 ** (30 / 10))
    add("NET002", "A", "30dB转线性信噪比1000，容量约29901.68bit/s，即约30kbps。", {"capacity_bps": capacity})
    add("NET011", "A", "按RFC9293普通三次握手，服务器响应客户SYN时发送SYN与ACK标志。", {"flags": ["SYN", "ACK"]})
    assert set(out) == set(IDS) and len(out) == 26
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/alpha/evidence/independent-review-91987ff.json')
    parser.add_argument('--allow-known-issues', action='store_true')
    args = parser.parse_args()
    path = ROOT / 'backend/data/questions.json'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == BANK_SHA256, '题库快照已变化，需先重新复核再更新审核基线'
    bank = json.loads(path.read_text(encoding='utf-8'))
    indexed = {q['question_id']: q for q in bank['questions']}
    work = calculate()
    rows = []
    for qid in IDS:
        q, result = indexed[qid], work[qid]
        result['question_id'] = qid
        result['bank_answer'] = q['answer']
        result['review_state'] = q['review_state']
        result['question_sha256'] = hashlib.sha256(json.dumps(q, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        result['source_ref_as_declared'] = q['source_ref']
        if result['independent_answer'] is not None and q['options']:
            assert result['independent_answer'] == q['answer'], f'{qid}答案发生非预期变化'
        rows.append(result)
    summary = {key: sum(r['conclusion'] == key for r in rows) for key in ['pass', 'explanation_revision', 'answer_error', 'invalid_question']}
    report = {'reviewer_role': '龚巍斌任务的独立复核，AI辅助推导及复算，未冒充本人线下手算',
              'date': '2026-11-15', 'baseline': '91987ff55169208611f54bbc559c8dcf75be2cbc',
              'bank_version': bank['version'], 'bank_sha256': BANK_SHA256,
              'scope': 26, 'summary': summary, 'cases': rows,
              'limitations': ['教材具体页码和原创/授权声明未获原始证据确认', '本报告不自动更新题库核验状态',
                              '综合题答案逐项见working与人工说明，不用整段字符串相等替代审阅']}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'scope': 26, 'summary': summary, 'output': str(args.output)}, ensure_ascii=False))
    return 0 if args.allow_known_issues else int(summary['answer_error'] + summary['invalid_question'] > 0)


if __name__ == '__main__':
    raise SystemExit(main())
