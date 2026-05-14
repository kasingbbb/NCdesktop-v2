# tests/real_samples/ — 真实样本端到端验收矩阵（task_012）

## 用途
为 7 类格式真实生产样本（脱敏后）建立端到端转录验收矩阵。本目录**只放规范与文档**，**不存放任何样本明文**。真实样本由独立私有仓 `samples-private/` 加密保管（task_000）。

## 关联资产
- 主入口脚本：`scripts/run-real-sample-matrix.sh`
- 共用断言库：`scripts/lib/sample-assertions.sh`（本地脚本与 CI 共用）
- 解密链：`scripts/decrypt-samples.sh`（task_000 PASS）
- 已知失败清单：`scripts/known-fail-list.json`
- CI workflow：`.github/workflows/real-samples-matrix.yml`
- 样本分布要求：[`sample_distribution.md`](./sample_distribution.md)
- 脱敏 SOP：`docs/sample_desensitization_sop.md`

## 命名约定（脚本依赖）

| 文件名模式 | 含义 | 脚本断言 |
|---|---|---|
| `pdf-scan_*.pdf` 或 `*_scan.pdf` | 扫描型 PDF；预期短路为 `E_SCAN_PDF_UNSUPPORTED`（task_009 路由 guard） | 计为 `known-fail`（不算阻断） |
| `*_known_production_failure.epub` | 生产已知失效 epub 样本（task_012 AC-6） | 必须 `pass`；否则 ESCALATE，不允许标 known-fail |
| 其它 | 普通样本 | 必须 `pass` |

## 运行（本地）
```bash
export MARKITDOWN_SAMPLES_KEY=<key>
export SAMPLES_PRIVATE_DIR=/abs/path/to/samples-private-checkout
bash scripts/run-real-sample-matrix.sh
```

## Dry-run（无 secret / 无样本时验证 plumbing）
```bash
DRY_RUN=1 bash scripts/run-real-sample-matrix.sh
```

## 输出
- `real-samples-report.json`（默认在仓库根；可用 `REPORT_OUT` env 覆盖）
- 退出码：0 = PASS（通过率 ≥ 95% 且无 unauthorized fail）；非 0 = FAIL/ESCALATE

## 当前状态
- 脚本与断言库 PASS（本 task）
- 真实 ≥35 样本入库：PENDING-OPERATOR（依赖 task_000 PM 拿到 samples-private 仓 URL + Deploy Key 后入库）
- CI 真实跑：PENDING-CI（依赖 macOS runner 可用性 + 上述样本入库）

## 严禁
1. 把样本明文（原文 / 转录后 markdown）写入构建产物或 CI 日志
2. 让 `run-real-sample-matrix.sh` 跳过扫描 PDF 或 epub 类
3. 用 `known-fail-list.json` 静默"已知生产失效 epub"样本（违反 AC-6）
