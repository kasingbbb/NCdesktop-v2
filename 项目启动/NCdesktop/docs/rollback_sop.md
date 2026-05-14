# Rollback SOP — NCdesktop Markitdown DMG

> **目的**：当线上 DMG 出现严重缺陷时，可在 4 小时内回滚到 N-1 归档镜像，阻断用户继续受影响并恢复可用状态。
>
> **范围**：DMG 发布通道（GitHub Release / 官网下载页）。仅覆盖宿主侧的镜像回滚，不包含云端/服务端回滚。
>
> **关联文档**：[manifest_schema_versioning.md](manifest_schema_versioning.md)、`scripts/archive-dmg.sh`、`scripts/vm-smoke.sh`（task_013）。

---

## 1. 回滚触发条件（任一满足即触发）

| # | 条件 | 数据来源 / 检测方式 | 阈值 |
|---|------|-------------------|------|
| T1 | 用户冷启失败上报 | 客服 / Sentry / GitHub Issue | ≥ 3 例独立用户 / 24h |
| T2 | Gatekeeper / 公证失效 | `spctl --assess` 在干净 VM 失败 | 1 例即触发（用户无法首次打开 = 100% 阻断） |
| T3 | 真实样本矩阵回归 | `run-real-sample-matrix.sh`（task_012） | epub 或任意格式通过率 < 80%（task_012 门禁 ≥95%，此处梯度降级到 80% 触发回滚研判） |
| T4 | manifest 自检失败率激增 | 应用启动遥测 / 日志 | `runtime_manifest_self_check` 失败率 > 5%（task_007 行为） |
| T5 | 安全/合规缺陷 | 安全团队 / 法务上报 | 1 例即触发（数据泄露、签名密钥泄漏等） |
| T6 | 灰度阶段 P0 bug | 内部灰度报告 | 1 例 P0（数据丢失 / 不可恢复崩溃） |

> **决策权**：T1/T3/T4 由 Tech Lead 决策；T2/T5/T6 由 PM 直接拍板，Tech Lead 同步执行。

---

## 2. Hotfix 周期目标

**总目标：发现 → 回滚镜像送达用户 ≤ 4 小时。**

| 阶段 | 时长上限 | 责任人 | 关键动作 |
|------|---------|--------|----------|
| 发现 → 决策 | 1h | PM + Tech Lead | 确认触发条件命中、决定是否回滚 |
| 镜像取回 → 签名验证 | 1h | Tech Lead | 从 `dist/archive/<N-1>/` 取回 DMG，干净 VM 跑 `vm-smoke.sh` |
| 推广 → 用户 | 2h | PM | 切换 GitHub Release 默认下载链接、推送官网公告、客服话术更新 |

**超时升级**：任一阶段超时 30 分钟，PM 必须升级到管理层并启动备用方案（例如临时下线下载页、改用 N-2）。

---

## 3. 通信模板

### 3.1 用户公告（中英双语）

**中文**：

> 【NCdesktop 紧急公告】
> 我们发现 vN.x.x 版本存在 <问题简述> 的问题。为保证您的使用体验，我们已临时回滚至上一个稳定版本 vN-1。
> 请前往 <下载地址> 重新下载安装，原版本可直接覆盖。
> 给您带来的不便我们深表歉意。已下载但未启动的用户也建议重新下载。
> — NCdesktop 团队，<时间戳>

**English**：

> [NCdesktop Notice]
> We have identified a <one-line summary> issue in version vN.x.x. To protect your experience, we have rolled back to the previous stable release vN-1.
> Please re-download from <URL> and reinstall (overwriting the previous build is safe).
> We apologize for the inconvenience.
> — NCdesktop Team, <timestamp>

### 3.2 内部 Incident 时间线

| 时间（UTC） | 角色 | 动作 | 状态 |
|------------|------|------|------|
| YYYY-MM-DD HH:MM | <角色> | <动作> | 进行中 / 完成 / 阻塞 |
| ... | ... | ... | ... |

字段填写规范：
- **角色**：必须是具体人名（如 "Tech Lead - Alice"），不写"团队"。
- **动作**：动词起始，量化到可验证步骤（例 "拉取 dist/archive/1.2.2/，sha256 校验通过"）。
- **状态**：进行中 / 完成 / 阻塞；阻塞必须在 30 分钟内升级。

事后 24 小时内由 Tech Lead 补写完整 RCA（Root Cause Analysis）并归档到 `docs/incidents/<date>.md`。

---

## 4. 责任人与 On-call 名单

> **以下为占位，PR review 时由 PM 实际填入。任何人员变更必须由 PM 在本节直接更新。**

| 角色 | 主 on-call | 备用 on-call | 联系方式 |
|------|-----------|-------------|---------|
| PM | `<PM 姓名 / 邮箱>` | `<备 PM / 邮箱>` | `<手机 / Slack>` |
| Tech Lead | `<Tech Lead 姓名 / 邮箱>` | `<备 Tech Lead / 邮箱>` | `<手机 / Slack>` |
| 客服 / 公告发布 | `<姓名 / 邮箱>` | `<备 / 邮箱>` | `<手机 / Slack>` |
| 安全 / 合规 | `<姓名 / 邮箱>` | `<备 / 邮箱>` | `<手机 / Slack>` |

**值班轮换**：每周一 09:00 轮换；轮换名单维护在 `docs/oncall_rotation.md`（占位，由 PM 创建）。

---

## 文档变更签字

**所有对本 SOP 的修改 PR 必须满足以下条件，否则 reviewer 不应批准合入：**

1. **双 review 强制**：PR 必须同时获得 PM（`<PM GitHub handle>`）与 Tech Lead（`<Tech Lead GitHub handle>`）的明确 approval。
2. **CI 验证**：`verify-archive-presence.yml` 必须 PASS（确认 N-1 归档仍存在，未被本次 PR 误删）。
3. **单人合入 = 违反 SOP**：若只有 1 个 approval，PR 不应合入。Reviewer 须主动驳回并 @ 缺席的另一签字人。
4. **紧急例外**：仅在 P0 incident 期间允许单签字临时合入，但 24 小时内必须由缺席方补签 + 写入 incident timeline。

**签字记录**（每次修改追加一行）：

| 修改日期 | PR # | PM 签字 | Tech Lead 签字 | 备注 |
|---------|------|---------|---------------|------|
| YYYY-MM-DD | #N | @<PM> | @<Tech Lead> | 初版 |
