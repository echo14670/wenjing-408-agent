# 第二轮测试复用样例

| 文件 | 用途 |
| --- | --- |
| `note.txt` | 正常TXT文本提取 |
| `note.md` | 正常Markdown提取 |
| `text.pdf` | 含文字层PDF |
| `mixed.pdf` | 第1页有文字、第2页为扫描/空白页 |
| `scan.pdf` | 纯扫描/无文字层PDF |
| `question.png` | 图片OCR失败路径 |
| `empty.txt` | 空文件400 |
| `unsupported.bin` | 不支持类型415 |
| `corrupt.pdf` | 损坏PDF失败项 |
| `incomplete_bank.json` | Cache条件不足模型/工具用例 |
| `generate_samples.py` | 重建上述样例；超限文件按20MB+1字节生成 |

超限样例体积超过20MB，未纳入仓库样例目录。需要时运行：

```powershell
python generate_samples.py
```

脚本会在当前目录重新生成 `oversized.txt` 及全部基础样例。
