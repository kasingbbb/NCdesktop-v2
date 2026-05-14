# 真实样本矩阵分布要求（task_012 AC-2）

> 由 task_000 SOP 脱敏后入库 `samples-private/`；本文档定义最小覆盖矩阵。

| 格式 | 最少数量 | 边界用例硬性要求 |
|---|---|---|
| `pdf-text` | 5 | 含图文本型 ≥ 2 |
| `pdf-scan` | 3 | 用于 `is_scan_pdf=true` 路径（task_009 短路 `E_SCAN_PDF_UNSUPPORTED`），文件名前缀 `pdf-scan_` |
| `docx` | 5 | 含表格 ×1、含中文 ×1、含 emoji ×1 |
| `pptx` | 5 | 含图片占位 ×1、含中文 ×1 |
| `xlsx` | 5 | 含表格 ×3、含中文 ×1、含 emoji ×1 |
| `html` | 5 | 含 `<script>` 标签 ×1、含 `<iframe>` ×1（预期被 markitdown 安全剥离） |
| `epub` | 5 | **必含 1 个生产已知失效样本**，命名 `*_known_production_failure.epub`；本期必须 PASS |
| `image` | 5 | 含 EXIF ×1、含 alt-text ×1；未配 LLM 走 `markitdown_image_fallback` |

**总计**：≥ 38（pdf-text 5 + pdf-scan 3 + docx/pptx/xlsx/html/epub/image × 5 = 33；合 38）。input.md 要求 ≥ 35，本分布满足。

## 入库 checklist（PM 操作员用）

- [ ] 每个样本经 `scripts/desensitize-sample.sh` 脱敏，产出 `.meta.json`
- [ ] 双人复核 PII 已去除（脱敏负责人 ≠ 打包负责人，PRD §7 / Debate R-⑥）
- [ ] `scripts/encrypt-samples.sh` AES-256 加密，仅入 samples-private 仓
- [ ] 命名约定遵守：扫描 PDF 用 `pdf-scan_` 前缀；生产已知失效 epub 用 `_known_production_failure.epub` 后缀
- [ ] 主仓 `forbid-raw-samples.yml` lint 不触发（明文未泄露）
- [ ] `decrypt-samples-dryrun.yml` 在 GH Actions 跑通 → 文件数 ≥ 35
- [ ] `real-samples-matrix.yml`（task_012）跑通 → 通过率 ≥ 95%
