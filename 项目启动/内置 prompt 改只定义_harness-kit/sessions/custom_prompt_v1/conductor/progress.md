# Conductor Progress — custom_prompt_v1

## 当前状态

- **STATE**: `UX_REVIEWED`（task_009 PASS；下一步进入 task_010 Architecture Guard 终审，或先做 task_007 v2 微改修 3 MAJOR）
- **当前 Task**: 无（task_009 完成；阶段性节点 — git commit 中）
- **更新时间**: 2026-05-15

---

## 项目摘要

- **Session**: custom_prompt_v1
- **项目名称**: NCdesktop — 用户自定义 Prompt 功能
- **复杂度**: L（完整 Debate + 完整 Conductor + Architecture Guard）
- **PRD 版本**: v1.1（PM 确认简化版，2026-05-15）
- **PRD 路径**: `sessions/custom_prompt_v1/prd/custom_prompt_prd_v1.md`
- **Session Context**: `sessions/custom_prompt_v1/session_context.md`

---

## PRD → Conductor 桥接摘要 — 接收方检查

依据：`core/handoff_contracts.md` § 1（Debate → Conductor）

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 核心功能清单存在且每项有优先级 | ✅ PASS | PRD § 桥接摘要列出 4 项功能，全部 P0：①设置页 Prompt 自定义区域 ②四条 Prompt 的文本编辑与保存 ③恢复默认功能 ④LLM 调用时读取自定义 Prompt |
| MVP 边界声明的"不做什么"非空 | ✅ PASS | "做什么" 3 项；"不做什么"（P2 列表）5 项：主界面联动 / 参数表单 / diff 预览 / 模板插槽 / 数据采集 |
| 高风险项已标注状态 | ⚠️ SOFT-WARN | 风险表实际列为「风险 + 缓解策略」，缺字面的"状态"列与"来源（Debate 哪一轮）"列。但每项风险都有明确的缓解策略，状态可隐式推断为 **已规划缓解**。不阻塞进入 ARCHITECTURE 状态。 |

**结论**：PRD 满足 Conductor 接收门槛。允许进入 ARCHITECTURE 状态。

---

## 已识别的高风险项（从 PRD 桥接摘要抽取，供 Architect 参考）

| # | 风险 | 推断状态 | 缓解策略（PRD 已声明） |
|---|------|---------|---------------------|
| R1 | 用户写的 Prompt 导致 LLM 输出格式异常，下游功能报错 | 已规划缓解 | 保留输出格式约束作为独立校验层，不受用户 Prompt 影响 |
| R2 | 用户 Prompt 过长超出 context window | 已规划缓解 | 保存时检查 token 长度，超限提示 |
| R3 | 内置 Prompt 升级后用户自定义版本落后 | 已规划缓解 | 用户自定义优先，不强制覆盖；可通过恢复默认获取最新版本 |

> Architect 在 task_001 中必须为 R1（输出格式校验层）、R2（token 长度校验）给出明确的技术方案落点。

---

## 不可妥协的技术底线（来自 PRD + session_context）

1. 内置 Prompt 始终作为 fallback 存在，用户自定义不可完全替代内置逻辑
2. 用户自定义 Prompt 数据必须持久化到本地 SQLite
3. 隐私优先：自定义 Prompt 内容不得上传至云端
4. 一键恢复默认，任何时候可回退
5. 内置 Prompt 升级时不覆盖用户已有的自定义

---

## 已完成 Tasks

- **task_001_architect** — Architect 产出完整技术方案（含 5 个 ADR、风险登记表、9 个后续 task 拆分），DONE 2026-05-15
- **task_002_dev_backend_data** — migration V15 + DB 层 + 4 Tauri commands + AppMode 注册修复。Reviewer 综合 4.9/5 PASS（0 BLOCKER / 0 MAJOR / 3 推迟 MINOR）。285 cargo test 全绿。DONE 2026-05-15
- **task_005_dev_frontend_contract** — 前端 types/user-prompt.ts + tauri-commands 4 函数 + contract test。Reviewer 综合 5.0/5 PASS（0 BLOCKER / 0 MAJOR / 3 MINOR）。tsc 0 error，14 测试全绿。DONE 2026-05-15
- **task_003_dev_backend_validation** — prompt_runtime（默认/合并/3 层守卫/占位符/双字节校验）+ classify_prompt 拆段。v1 FIX(4.45/5) → v2 PASS(5.0/5)：复刻 knowledge.rs system_addon 字面 + 给 task_004 留 chat.rs 合并 bug 信号灯。328 cargo test 全绿。DONE 2026-05-15
- **task_006_dev_frontend_store** — zustand userPromptStore（loadAll/setDraft/save/reset/resetAll + UTF-8 byteLen + 错误透传）。Reviewer 综合 5.0/5 PASS（0 BLOCKER / 0 MAJOR / 3 MINOR）。20/20 vitest + tsc 0 error。DONE 2026-05-15
- **task_004_dev_llm_injection** — chat.rs system 合并修复 + 3 处 LLM 调用切到 assemble_messages_for_* + AC-8 字面回归断言 + FIXME 清理。Reviewer 综合 4.80/5 PASS（0 BLOCKER / 0 MAJOR / 4 MINOR）。全表 342 cargo test + 0 deprecated warning。DONE 2026-05-15
- **task_007_dev_frontend_ui** — PromptCustomizationPanel + SettingsPanel 新增 Tab。Reviewer 综合 4.80/5 PASS（0 BLOCKER / 0 MAJOR / 3 MINOR 文案/UX 选择）。23/23 vitest + tsc 0 error。R6/ADR-005 严守，PR-4 半成品零触碰。DONE 2026-05-15
- **task_008_test_e2e** — Rust e2e 集成测试（8 类场景：正常/占位符/16KB+1 保存层/64KB 调用前/R1 对抗式/单条恢复/全部恢复/R3 兼容）+ 33 项手动测试清单。Reviewer 综合 4.80/5 PASS（0 BLOCKER / 0 MAJOR / 2 MINOR）。e2e 20/20 + lib 342/342 全绿，零回归。生产代码零改动。DONE 2026-05-15
- **task_009_ux_review** — UX 体验审查（10 项 Nielsen 启发式 + 5 核心旅程走查 + 技术性 UX 检查 + R4 文案决议）。启发式平均 3.5/5，5 旅程全畅通（A 编辑保存 3.5 / B 单条恢复 4.5 / C 全部恢复 4.5 / D 字节超限 4.5 / E 占位符 5.0）。0 BLOCKER / 3 MAJOR / 7 MINOR；**判定 PASS**（无核心旅程阻断）。R4 文案建议：方案 B（para/tagging 折叠头加共享调用副标题 < 10 行）。建议 task_007 二轮微改 < 50 行修 3 MAJOR（spinner+toast / 错误横条多子项重复 / aria-disabled+aria-label），但非阻塞。DONE 2026-05-15

---

## 当前 Task 详情

**阶段性节点：UX 评审 PASS（task_009 完成）**

- 9/10 task 已 PASS（task_001~task_009）
- 仅剩 `task_010_architecture_guard` 终审待启动
- 用户已要求在该节点 git commit + 留 continue prompt，下一次会话恢复

**可选分支（恢复后由用户决定）**：
1. 直接启动 `task_010_architecture_guard`（Architecture Guard 终审，扫描 ADR 落地 / 目录一致 / 契约一致 / 风险闭环）
2. 先做 `task_007 v2 微改`（修 task_009 提出的 3 MAJOR + 部分 MINOR，预估 < 50 行），再启动 task_010
3. 先做 R4 文案落地（方案 B，~10 行）+ 3 MAJOR 修复，再启动 task_010

**Conductor 建议**：选项 2 或 3。task_010 在所有可见瑕疵修复后扫描会更有意义；且 < 50 行改动风险低。

---

## 待执行 Task 队列

依赖拓扑（来自 Architect output.md § 11）：

```
task_002 ──┬─► task_003 ──► task_004 ──┐
           │                            ├─► task_008 ──► task_009 ──► task_010
task_005 ──┴─► task_006 ──► task_007 ──┘
```

可并行波次：
- **第一波**：`task_002` 独立启动
- **第二波**（task_002 完成后）：`task_003` 与 `task_005` 可并行
- **第三波**（task_003 / task_005 完成后）：`task_004` 与 `task_006` 可并行
- **第四波**：`task_007` 串行（依赖 task_006）
- **第五波**：`task_008` 串行（依赖 task_004 + task_007）
- **第六波**：`task_009` → `task_010` 串行

完整清单：

- [ ] **task_002_dev_backend_data** — 后端 migration V15 + DB 层 + Tauri command CRUD + AppMode 注册修复
- [ ] **task_003_dev_backend_validation** — 后端 prompt_runtime 层（默认值 / 合并 / 输出守卫 / 占位符 / 字节校验 / classify_prompt 拆段）
- [ ] **task_004_dev_llm_injection** — 后端 LLM 调用链注入点改造（3 处：classify / concept / aggregation）
- [ ] **task_005_dev_frontend_contract** — 前端 types + tauri-commands 契约层
- [ ] **task_006_dev_frontend_store** — 前端 zustand userPromptStore
- [ ] **task_007_dev_frontend_ui** — 前端 PromptCustomizationPanel + SettingsPanel 新增 Tab
- [ ] **task_008_test_e2e** — 端到端测试（覆盖正常路径 / 占位符校验 / 字节超限 / R1 对抗式 prompt / 一键恢复）
- [ ] **task_009_ux_review** — UX 评审（信息架构 / 文案 / 错误提示 / 可达性 / R4 决议）
- [ ] **task_010_architecture_guard** — Architecture Guard 终审（ADR 落地 / 目录一致 / 契约一致 / 风险闭环）

详细 AC 与参考文件见各 task 的 `input.md`。

---

## 已知问题 / Blockers

无

---

## 关键决策记录

- **[2026-05-15]** PRD 桥接摘要的"高风险项"表缺字面状态列，判定为 **软偏差，不阻塞**。理由：每项风险均带缓解策略，状态可隐式推断为"已规划缓解"。Architect 在 task_001 中应将三项风险纳入方案约束。
- **[2026-05-15]** 复杂度 L，启用完整 Conductor 流程（含 Architecture Guard）。

---

## 累积异常计数器

| 异常模式 | 当前计数 | 阈值 |
|---------|---------|-----|
| 同类 FIX 重复 | 0 | 2 |
| 连续低分（≤3/5） | 0 | 3 |
| ESCALATE 次数 | 0 | 2 |
| 单 task FIX 轮次 | — | 2 |

---

## 状态转移日志

[2026-05-15] STATE: ∅ → INIT | Task: — | 原因: Conductor 启动，读取 PRD/session_context 完毕，桥接摘要通过接收方检查（1 处软偏差已记录） | 风险: 无
[2026-05-15] STATE: INIT → ARCHITECTURE | Task: task_001_architect | 原因: 创建 task_001_architect/input.md 完毕，dispatch Architect subagent 产出技术方案与 Dev task 拆分 | 风险: 中（需现状勘察现有 promptStore.ts 与 LLM 调用链）
[2026-05-15] STATE: ARCHITECTURE → 待 PM/Conductor 决定 | Task: task_001_architect → DONE | 原因: 技术方案与 task 拆分完毕（5 ADR + 9 后续 task + 风险登记表 R1~R9） | 风险: 中（PRD 4 module ↔ 后端 3 调用链需 PM 在 output.md § 12 复核；R5 既有 AppMode 注册缺口需 task_002 修复；PR-4 半成品代码遗留待清理）
[2026-05-15] STATE: ARCHITECTURE → DEVELOPING | Task: task_002_dev_backend_data | 原因: Conductor 接受 Architect § 12 全部 4 项偏离处置（自主推进），dispatch Dev | 风险: 中（R5 AppMode 注册需在 task_002 中修复）
[2026-05-15] STATE: DEVELOPING → REVIEWING | Task: task_002_dev_backend_data | 原因: Dev 交付完毕（285 测试全绿，含三波 mod 挂接 R5 修复），dispatch Reviewer | 风险: 低
[2026-05-15] STATE: REVIEWING → DEVELOPING | Task: task_002 PASS → 启动 task_003 + task_005 并行 | 原因: Reviewer 综合 4.9/5 PASS（0 BLOCKER / 0 MAJOR / 3 推迟 MINOR），按依赖拓扑第二波并行（Rust 与 TS 文件零交集）| 风险: 低
[2026-05-15] STATE: DEVELOPING → REVIEWING | Task: task_003 + task_005 双交付 | 原因: 两个 Dev subagent 完成（task_005 一次中断后续接）| 风险: 低
[2026-05-15] STATE: REVIEWING → DEVELOPING | Task: task_005 PASS（5.0/5）+ task_003 FIX（4.45/5，2 MAJOR）| 原因: task_005 解锁 task_006；task_003 进 Fix 模式（修复 MAJOR-1 复刻 knowledge.rs addon + MAJOR-2 给 task_004 留信号灯）。task_003 Fix 与 task_006 文件零交集，再次并行 | 风险: 中（task_003 Fix 涉及 R1 防御层完整性，task_004 input.md 需要据此调整）
[2026-05-15] STATE: DEVELOPING → REVIEWING | Task: task_003 Fix + task_006 双交付 | 原因: 两 Dev 各自完成交付 | 风险: 低
[2026-05-15] STATE: REVIEWING → DEVELOPING | Task: task_003 v2 PASS(5.0/5) + task_006 PASS(5.0/5) | 原因: 双双解锁。Conductor 在 dispatch task_004 前补强其 input.md（追加 AC-0 chat.rs 修复 / AC-7 FIXME 清理 / AC-8 字面回归断言，转化 task_003 v2 信号灯）。task_004 与 task_007 文件零交集（Rust vs TS）并行 | 风险: 中（task_004 是 R1 防御链路真正生效的关键节点；chat.rs 修复触及 LLM 通讯核心）
[2026-05-15] STATE: DEVELOPING → REVIEWING | Task: task_004 + task_007 双交付 | 原因: 两 Dev 完成 | 风险: 低
[2026-05-15] STATE: REVIEWING → DEVELOPING | Task: task_004 PASS(4.80/5) + task_007 PASS(4.80/5) → 启动 task_008 | 原因: 第四波双双 PASS（0 BLOCKER / 0 MAJOR）；R1/R2/R4/R6/R8 全部闭环；按拓扑进入 task_008 端到端测试 | 风险: 低（task_008 主要是聚合验证，无新代码路径）
[2026-05-15] STATE: DEVELOPING → REVIEWING → UX_REVIEW | Task: task_008 PASS(4.80/5) → 启动 task_009 UX 评审 | 原因: e2e 测试 20/20 PASS + 全表 342/342 零回归 + 33 项手动测试清单交付；R1 对抗式 / R3 兼容 / 4 module 独立等关键场景全覆盖 | 风险: 低
[2026-05-15] STATE: UX_REVIEW → UX_REVIEWED（阶段性节点） | Task: task_009 PASS（启发式 3.5/5，0 BLOCKER / 3 MAJOR / 7 MINOR） | 原因: 5 核心旅程畅通无阻断；R4 文案建议方案 B（< 10 行）；建议 task_007 二轮微改 < 50 行修 3 MAJOR；用户指定此处 git commit + 留 continue prompt | 风险: 无（生产代码无改动，仅文档/UX 报告）
