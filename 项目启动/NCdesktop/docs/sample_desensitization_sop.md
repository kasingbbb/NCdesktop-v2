# 真实样本脱敏与加密 SOP（task_000）

> **PENDING-PM**：样本仓托管位置（GitHub 私有 / GitLab / 自建）由 PM 最终拍板。本 SOP 默认假设 **GitHub 私有仓 + git-lfs**，所有具体 URL/Org/Repo 名使用占位符：`<SAMPLES_REPO_URL>` / `<SAMPLES_REPO_NAME>` / `<ORG>`。一旦 PM 指定，请全局替换并删除本提示。

适用范围：NCdesktop / Markitdown 全系列修复涉及的 7 类生产真实样本（pdf-text / pdf-scan / docx / pptx / xlsx / html / epub / image）。
依据：ADR-009（私有 git-lfs + AES-256），PRD §3.1-F8、§4.4、§6 Sprint 0，Debate Layer 3 R-⑥。

---

## 1. 脱敏字段清单 + 规则版本管理

**规则版本：v1.0**（与 `scripts/desensitize-sample.sh` 内 `RULE_VERSION` 常量保持一致）。规则升级须同时升版本号并在本节追加 CHANGELOG。

| 字段 | 识别规则（v1.0） | 替换 token |
|------|------------------|-----------|
| 邮箱 | `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` | `[EMAIL_REDACTED]` |
| 中国手机号 | 11 位，前缀 `1[3-9]` | `[PHONE_CN_REDACTED]` |
| 国际手机号（E.164） | `+` + 1-3 位国家码 + 4-14 位数字 | `[PHONE_E164_REDACTED]` |
| 身份证 18 位 | 17 位数字 + 末位（数字或 X） | `[IDCARD_REDACTED]` |
| 银行卡号 | 13-19 位连续数字 | `[BANKCARD_REDACTED]` |
| 中文公司名 | 含「有限公司 / 股份有限公司 / 科技有限公司 / 集团 / 股份公司」后缀 | `[COMPANY_CN_REDACTED]` |
| 英文公司名 | 以 `Inc / Ltd / Corp / LLC / Co., Ltd` 结尾 | `[COMPANY_EN_REDACTED]` |
| 物理地址 | 中文「省 / 市 / 自治区 + 区 / 县 + 路 / 街 / 道 + 号」启发式 | `[ADDRESS_CN_REDACTED]` |
| 中文姓名 | 常见姓氏白名单首字 + 1-3 字（避免误伤） | `[NAME_CN_REDACTED]` |
| 图像 EXIF | `exiftool -all=` 全字段清除 | （二进制级删除） |

**CHANGELOG**
- v1.0（2026-05-13）：初版；7 大类 PII；启发式 + 正则，无 ML/NER 后端。

---

## 2. 工具链与调用顺序

```
┌─────────────────┐    desensitize     ┌────────────────────┐   encrypt    ┌─────────────────────┐
│ 原始样本（明文）│ ─────────────────→ │ 脱敏样本 + meta.json │ ───────────→ │ <file>.enc（加密）  │
│  本地隔离目录   │                    │   本地隔离目录       │              │ → 推送 samples 仓   │
└─────────────────┘                    └────────────────────┘              └─────────────────────┘
```

**步骤**：

1. **隔离工作区**：在 **NCdesktop 主仓之外** 的本地目录处理（推荐 `~/notecapt-samples-staging/`），全程不接入主仓。
2. **脱敏**：
   ```bash
   DESENSITIZER="alice" bash scripts/desensitize-sample.sh ~/notecapt-samples-staging/raw/foo.docx
   # → ~/notecapt-samples-staging/raw/foo.sanitized.docx
   # → ~/notecapt-samples-staging/raw/foo.sanitized.docx.meta.json
   ```
3. **人工复核**（见 §3）。
4. **加密**：
   ```bash
   export MARKITDOWN_SAMPLES_KEY="$(security find-generic-password -s notecapt-samples-key -w)"  # 或本地 vault
   bash scripts/encrypt-samples.sh ~/notecapt-samples-staging/sanitized/
   ```
5. **上传**：将 `*.enc` + `*.meta.json` push 到 `<SAMPLES_REPO_URL>`（git-lfs track `*.enc`）；**绝不**上传明文 `.sanitized.*`。
6. **清理**：staging 区原始 + 脱敏明文文件用 `rm -P`（Darwin overwrite）或 `shred -u`（Linux）清除。

**密钥管理**：
- 本地：macOS Keychain（`security add-generic-password -s notecapt-samples-key -w '<key>'`）。
- CI：GitHub Actions secret `MARKITDOWN_SAMPLES_KEY`。
- 长度：≥ 32 字符高熵随机串（`openssl rand -base64 48`）。
- 禁止硬编码 / 提交到任何 git 仓。

---

## 3. 双人复核流程

**核心原则**：**脱敏者 ≠ 复核者**（PRD §7 / Debate R-⑥）。

**正式流程（发布前必须执行）**：
1. 脱敏者 A 执行 §2 步骤 1-2，产出 `<file>.sanitized.*` + `meta.json`。
2. 提 PR 到 `samples-private` 仓（仍是脱敏明文阶段，不加密；samples-private 仓内部按"明文 PR + 复核合并后加密"两阶段执行）。
3. 复核者 B 拉取 PR，按 **复核 Checklist** 逐项勾验：
   - [ ] grep 测试：`grep -E '1[3-9]\d{9}|\d{17}[\dXx]|@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' <file>` 必须无命中
   - [ ] 公司名 / 人名 / 地址人工通读（5-10 分钟 / 样本）
   - [ ] 图像目测无身份证 / 工牌 / 车牌 / 二维码 / 地理标识
   - [ ] meta.json 字段齐全且不含 PII
   - [ ] 文件名本身不含 PII（如`张伟简历.pdf` → `resume_001.pdf`）
4. 复核者 B 在 PR 评论中写"Reviewed-by: B, no PII detected"并 approve。
5. 由复核者 B 执行 §2 步骤 4-6（加密 + 上传 + 清理）。
6. 双方在 `samples-private` 仓 `desensitization-log.md` 追加一行：`<file_sha> | A | B | timestamp | rule_v1.0`。

**MVP 期妥协（2026-05-13 方案 A 决策）**：
- 当前阶段仅有单人，由同一人扮演脱敏者 + 复核者，但通过 **subagent 职责分离**（dev-desensitize ≠ dev-pack）模拟双人。
- **不可作为正式发布依据**：上线前 PM 必须指派真人复核者并补齐 §3 正式流程。
- 妥协期内，每个样本仍需独立执行 grep 测试 + 通读 + 在 log 中标注 `B=<placeholder>`。

---

## 4. 法律风险声明

- 处理的样本可能包含 **个人身份信息（PII）**、**版权内容**、**商业秘密**。
- **法规依据**：《中华人民共和国个人信息保护法》（个保法）、《数据安全法》、《网络安全法》。
- **当事人知情同意**：所有真实样本必须满足以下任一来源合法性：
  1. 当事人书面同意将文档用于 NoteCapt 内部测试（保留同意书 PDF 到 `samples-private/consent/`）；
  2. 公开渠道（政府公开数据 / CC 协议 / 用户主动公开发布）；
  3. 合成 / 半合成样本（基于公开模板 + 人工编造 PII）。
- **跨境**：禁止上传任何样本至境外 SaaS（含在线脱敏服务、OCR API、翻译 API）。
- **保留期**：默认 12 个月；超期未使用样本应归档或删除。
- **审计**：`desensitization-log.md` 须保留 ≥ 3 年。

---

## 5. 撤回机制

**触发**：当事人提出删除要求 / 同意书撤回 / 发现样本含未脱净 PII。

**SLA**：
- T+0（即时）：将样本从 `samples-private` 主分支移除（git rm + commit + push）。
- T+1（24h 内）：对 lfs 历史执行 `git lfs prune` + 联系 GitHub Support 触发 LFS 对象彻底删除。
- T+3（72h 内）：通知 CI 强制 re-decrypt 后 ls 校验当前文件数与 manifest 一致（防止使用缓存的旧版本）。
- T+7（一周内）：书面回复当事人确认删除完毕。

**流程**：
1. 收到撤回请求 → 在 `samples-private/withdrawal-requests/` 新建 issue 单（含当事人联系方式 + 文件 sha256）。
2. 由复核者 B 在 PR 中删除对应 `.enc` + `.meta.json`。
3. 在 `desensitization-log.md` 标记 `WITHDRAWN: <sha> @ <date>`。
4. 通知所有下游 task（task_012 真实样本矩阵）相应矩阵行降级或补样。

---

## 6. 应急 / 泄漏处置

**场景**：明文样本不慎进入主仓 / 密钥泄漏 / CI artifact 含明文。

**处置路径**：
1. **立即（T+0，1h 内）**：
   - 撤回 PR / 删除 commit（`git push --force-with-lease`，受 GitHub branch protection 限制时联系 admin）。
   - 旋转 `MARKITDOWN_SAMPLES_KEY`（生成新 key → 用旧 key 解密所有 `.enc` → 新 key 重新加密 → push）。
   - 删除受影响 CI run（GitHub Settings → Actions → 删除 run）。
2. **通报（T+1，4h 内）**：
   - 内部：邮件 + IM @ PM + 安全负责人；
   - 外部：若 PII 泄漏给非授权第三方，按个保法第 57 条 72h 内通报监管部门 + 通知当事人。
3. **复盘（T+3，一周内）**：
   - 提交事故报告到 `samples-private/incidents/<date>.md`；
   - 评估 lint workflow（`.github/workflows/forbid-raw-samples.yml`）是否失效；
   - 升级规则版本（如 v1.0 → v1.1）并重跑全量样本。
4. **预防**：
   - 主仓 lint workflow（见 `.github/workflows/forbid-raw-samples.yml`）阻断 7 类二进制后缀；
   - `.gitignore` 显式排除；
   - pre-commit hook（可选）本地拦截。

---

## 附录 A：样本入库 Checklist（PENDING-OPERATOR）

> 本 task 仅交付脚本与 SOP，**不实际入库样本**。下表为占位条目，由人工操作员（PM 指派）按本 SOP 流程填充。AC-4 的最终满足以 `samples-private/desensitization-log.md` 实际记录为准。

| 格式 | 目标数量 | 已入库 | 备注 |
|------|----------|--------|------|
| pdf-text | ≥3 | 0 | task_009 验证依赖 |
| pdf-scan | ≥3 | 0 | task_009 验证依赖（图像层 OCR 后须二次脱敏） |
| docx | ≥5 | 0 | — |
| pptx | ≥5 | 0 | — |
| xlsx | ≥5 | 0 | — |
| html | ≥5 | 0 | — |
| epub | ≥5 | 0 | 含 ≥1 已知 markitdown 0.1.5 epub bug 触发样本 |
| image (jpg/png) | ≥5 | 0 | EXIF 已剥离 |
| **合计** | **≥36** | **0** | AC-4 阈值 ≥35 |

---

## 附录 B：相关文件

- `scripts/desensitize-sample.sh` — 脱敏脚本（v1.0）
- `scripts/encrypt-samples.sh` — AES-256 加密
- `scripts/decrypt-samples.sh` — AES-256 解密
- `.github/workflows/decrypt-samples-dryrun.yml` — CI 解密 dry-run
- `.github/workflows/forbid-raw-samples.yml` — 主仓 lint 阻断
- ADR-009（`sessions/markitdown_fix/conductor/tasks/task_001_architect/output.md`）
