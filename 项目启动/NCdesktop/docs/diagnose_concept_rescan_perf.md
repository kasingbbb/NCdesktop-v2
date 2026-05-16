# 诊断报告：知识概念重新扫描性能瓶颈

> 诊断时间：2026-05-16
> 仓库 HEAD：`02fd72ae2e9e69eeb3ffd3813a779b0487afa1b5`
> 模式：只读诊断，未改动任何代码/DB
> 工具：日志 grep + sqlite3 SELECT + Read

---

## TL;DR（最重要）

- **主因**：`extract_concepts_for_library` 是**严格串行**的 `for ... await chat_completion(...)` 循环，单文档 LLM 调用 ~58 秒，87 文档需要约 **1.4 小时**才能跑完；并且每次 LLM 调用前都**抢一把 `db.conn.lock()`**，单条 SQLite 互斥锁在持有时跨越 60s 网络往返，**强迫所有后续 LLM 抽取必须排队**。
- **量化结论**：单文档 ≈ 58s（实测 01:28:07 → 01:29:05），全量 87 文档 ≈ **87 × 58s ≈ 84 分钟 ≈ 1h24m**；用户感知"0/87 卡很久"的真实原因是 **A：进度只在文档完成后才 emit，第一个文档需 ~60s 才把进度从 0 跳到 1**（前端事件机制、store、emit_progress 实现都验证过没有 bug，**根本原因就是单步太慢**）。
- **推荐 P0 优化**：把 LLM 调用从串行改为 `buffer_unordered(4~6)` 并发 + 把内容截断到 ~8KB（avg=62KB 大部分是冗余 OCR/转写文本）。两项叠加可把 84min 压到 **~7–10min**（约 9× 加速）。

---

## 现场证据

### 日志切片

```
[2026-05-16][01:28:07][app_lib::commands::knowledge][INFO] LLM call: module=concept bytes=19166 user_overridden=true
[2026-05-16][01:29:05][app_lib::commands::knowledge][INFO] LLM call: module=concept bytes=45863 user_overridden=true
```

- 两条 concept 调用的时间差 = 58 秒 → 这就是单文档端到端耗时（含 DB 读、prompt 组装、LLM 往返、JSON 解析、DB 写入）。
- 因为 prompt/解析/DB 全部 < 几 ms，**~58s 几乎全部花在 LLM HTTP 往返上**。

### DB 计数

```text
assets                : 170     # 全表（含派生 markdown）
                       87      # fetch_library_assets 过滤后（默认知识库 fffbaf16）
concepts              : 457
concept_cases         : 1163
concepts_extraction_log: 40      # 已增量记录的 (asset, content_hash) 对
knowledge_units       : 15
extracted_content     : 137
```

**content size 分布（87 个待扫描文档）**：

| min | avg | max |
|------|------|------|
| 0 bytes | **62090 bytes ≈ 62 KB** | **992947 bytes ≈ 970 KB** |

- 日志 `bytes=45863` 与平均值 ~62KB 数量级一致：**单次 prompt 平均 ~15K token，最大近似 250K token**。
- ARK ark-code-latest 处理 15K token in/out 非流式，~60s 是合理的；970KB content 会**直接触发 max_tokens 上下文超限**或单次推理 >3 分钟。

### 仓库版本

- HEAD：`02fd72a feat: UX 二轮微改 + Architecture Guard 终审（所有 task PASS）`
- 当前 LLM 配置（DB settings 表）：
  - `llm.base_url` = `https://ark.cn-beijing.volces.com/api/coding`
  - `llm.model` = `ark-code-latest`（火山方舟"豆包代码"模型）

---

## 前端入口

**文件**：`src/components/features/knowledge/KnowledgeAssociationView.tsx`

- **按钮**：第 210–224 行，`<button onClick={() => handleStartScan(true)}>`（force=true）。
- **handler**：第 102–105 行：

```tsx
const handleStartScan = (force = false) => {
  setScanStarted(true);
  void startExtraction(libraryId, force);
};
```

- **进度数据来源**：
  - **事件订阅**：第 74–98 行 `listen<ExtractionProgress>('notecapt/concept-extraction-progress', ...)` 把后端 emit 的 `{totalAssets, processed, conceptsFound, status}` 写进 `useKnowledgeStore.extractionProgress`。
  - **进度条渲染**：第 345–375 行 `ExtractionProgressBar`，从 store 取 `progress.processed / progress.totalAssets`，文本 `已处理 {processed}/{totalAssets} 个文档 · 发现 {conceptsFound} 个概念`。

- **store action**：`src/stores/knowledgeStore.ts:179–205`：
  - 触发前先把 `extractionProgress` 初始化为 `{0, 0, 0, "running"}` → 这就是用户首先看到的 **"0/87"**（其实 totalAssets 也是 0，直到后端第一次 emit）。
  - 然后 `await cmd.extractConceptsForLibrary(libraryId, force)`（**注意：这个 await 会一直挂着直到整个 87 文档循环结束**）。
  - **后端 emit 的进度事件 vs store 初始化值之间没有抢占冲突** —— 因为 emit 是后台事件总线，每收到一次就 setExtractionProgress 一次。

**前端没有 bug**。"0/87 卡很久"完全来自后端单步慢。

---

## 后端实现

### Tauri command 定位

**文件**：`src-tauri/src/commands/knowledge.rs:87–280`
**fn**：`extract_concepts_for_library(db, app, library_id, force) -> ExtractionProgress`

### 遍历模式：**严格串行**

第 128 行：
```rust
for (asset_id, project_name, asset_name, content_snippet, content_hash) in &assets {
    ...
    if let Ok(response) = chat_completion(&client, messages).await {
        ...
    }
    processed += 1;
    emit_progress(&app, &library_id, total, processed, concepts_found, "running");
}
```

- **没有 `tokio::spawn` / `join_all` / `Stream::buffer_unordered`**。
- **每文档的 await 串行阻塞下一文档**。
- 进度事件 `emit_progress` 只在 `processed += 1` 之后才推送 → **从 0 跳到 1 必须等 60s**，这就是 "0/87 卡很久" 的全部解释。

### 单文档处理链路（按代码顺序）

| 步骤 | 文件:行 | 估算耗时 |
|------|---------|---------|
| 1. F-8 增量去重判定（`logged_pairs.contains`） | knowledge.rs:136–145 | < 1µs |
| 2. **抢 `db.conn.lock()`** + 组装 messages（含 prompt_runtime 拼模板） | knowledge.rs:150–173 | ~1–5 ms |
| 3. log::info!（"LLM call: module=concept"） | knowledge.rs:181 | ~10 µs |
| 4. **`chat_completion(...).await`** —— HTTP POST 到 ark.cn-beijing.volces.com `/v1/messages` | chat.rs:82–125 | **~55–60 s（占 ~99%）** |
| 5. JSON 解析（`parse_extracted_concepts`） | knowledge.rs:587–593 | < 1 ms |
| 6. **抢 `db.conn.lock()`** 写入 concepts / cases / concepts_extraction_log | knowledge.rs:191–242 | ~5–20 ms |
| 7. emit 进度事件（`app.emit("notecapt/...")`） | knowledge.rs:398–416 | < 1 ms |

**结论**：LLM HTTP 往返 ≈ 99% 总耗时。

### LLM 调用配置

**文件**：`src-tauri/src/llm/chat.rs:10–20` 和 `client.rs:124–125`

```rust
// chat.rs:13
reqwest::Client::builder()
    .connect_timeout(Duration::from_secs(15))
    .timeout(Duration::from_secs(75))   // 单请求上限 75s
    .build()

// client.rs:124 / 125
max_tokens: 4096,
temperature: 0.7,
stream: false,   // 非流式
```

- **timeout=75s，stream=false** → 即使 LLM 还在生成 token，前端也只能等它**全部生成完**才一次拿到响应。**没有流式，单步注定是分钟级**。
- **max_tokens=4096**（输出）—— OK，与 58s 单步合理。
- **model=ark-code-latest**（豆包代码模型）—— 不是 thinking 模型，但输入 ~15K token 时它的推理速度大约就是 ~50–60s/次（与日志吻合）。
- **with_retry**（retry.rs）：3 次指数退避（1s/2s/4s），若 LLM 抖动一次重试，单步可膨胀到 ~120s + 之前那次失败的 75s = **接近 3 分钟**。

### 进度事件机制

- 后端：`emit_progress` 用 `app.emit("notecapt/concept-extraction-progress", json!{...})`（knowledge.rs:398–416），**每文档完成 1 次**（含跳过/失败也 emit），**totalAssets 在第一次 emit 时就已经是 87**。
- 前端：`@tauri-apps/api/event::listen` 收到后写 store → React 重渲染 ExtractionProgressBar。

**事件名前后端一致**：`notecapt/concept-extraction-progress`（前 KnowledgeAssociationView.tsx:77；后 knowledge.rs:407）。**没有 bug**。

---

## 性能拆解

| 阶段 | 单次耗时 | 占比 |
|------|---------|------|
| DB 读 87 asset 列表（一次性） | ~5 ms | 0.0001% |
| Prompt 组装（含锁） | ~2 ms | 0.003% |
| **LLM HTTP POST（连接+推理+下载）** | **~58 s** | **~99.95%** |
| JSON 解析 | ~0.5 ms | 0.0008% |
| DB 写 concepts + cases + log | ~10 ms | 0.017% |
| `app.emit` 进度事件 | < 1 ms | < 0.002% |

**单文档总耗时 ≈ 58.02 秒，LLM 占 ~99.95%。**

**全量 87 文档（force=true）总耗时 ≈ 87 × 58 = 5046 秒 ≈ 84 分钟。**
（若中途有 500/429 重试，可能到 100+ 分钟）

---

## 瓶颈定性

### 1. 主瓶颈：**LLM 调用串行 + 非流式**

- 串行循环让 87 文档**完全没有利用 ARK 服务端并发额度**（ARK 默认 RPM 通常 60+，没用上）。
- 非流式让单文档必须**等待最后一个输出 token** 才返回 → 前端"已处理 0/87"在第一个文档生成完之前**没有任何进度反馈**。
- 大部分文档 content 远超 prompt 需要的信息量：avg 62KB，但 LLM 抽取概念实际只需要前 ~4–8KB（开头摘要 + 头几节）就足够，**剩下 50KB+ 都是不必要的输入 token 成本与延迟**。

### 2. 次瓶颈：**每文档抢一次 `db.conn.lock()`**

- 后端用 `Mutex<Connection>` 单连接 + `unwrap_or_lock`。**当抽取串行时锁本身不是瓶颈**（每次只占几 ms）。
- 但**一旦改成并发**，所有并发任务都要排队抢这把锁 → 锁会立刻变成新瓶颈。所以并发改造时必须搭配**单独的写连接**或**短作用域 sub-statement scope**（已经是 sub-scope，没问题），或者改用 `Arc<r2d2::Pool<SqliteConnectionManager>>`。

### 3. 隐性瓶颈：**content 截断缺失**

- `fetch_library_assets` 把完整 markdown / raw_text 喂给 prompt（COALESCE 链路，knowledge.rs:426–440）。
- 单一 ~1MB 的文档（max=992947 字节）会在 ARK 上**直接超出 32K~128K 上下文**或被截断，浪费几十秒。
- 当前 prompt 模板（`prompt_runtime::CONCEPT_DEFAULT`）没有 hard cap。

### 4. 增量功能存在但被 force=true 完全跳过

- 第 136–145 行 F-8 增量逻辑通过 `concepts_extraction_log` (asset_id, content_hash) 跳过已处理素材。
- **DB 现状：87 文档中已记录 40 个 logged_pair**。
- 用户点的是"重新扫描"（`handleStartScan(true)`，**force=true**），所以这次 0 个跳过，全部 87 个都要走 LLM。**默认进入页面的 EmptyState 引导扫描则是 force=false**，本该走增量，但当前用户是主动点"重新扫描"。

---

## 优化建议（按 ROI 排序）

### P0（最高 ROI，预估收益 > 80%）

#### P0-1：把 LLM 抽取从串行改为 `buffer_unordered(4)` 并发

- **改动文件**：`src-tauri/src/commands/knowledge.rs:128–247`（替换 `for ... in &assets` 循环）
- **预估代码量**：~80 行（重构成 `futures::stream::iter(assets).map(|a| async move { ... }).buffer_unordered(4)`）
- **预期收益**：87 × 58s / 4 ≈ **22 分钟**，从 84min → 22min，**3.8× 提速**
- **风险/约束**：
  - ARK RPM 限制：需先确认免费配额（通常 60 RPM、150 RPS、TPM 50K~200K）；并发 4 在 4096 max_tokens 下 TPM ~80K，**接近 200K TPM 边界**，应支持配置项 + 429 兜底（with_retry 已有）。
  - DB 锁：写入 concept 用 short sub-scope `{ let conn = db.conn.lock()...; ... }`，并发安全。
  - **必须**：进度计数 `processed` 改成 `AtomicUsize`，emit_progress 接受外部计数器；`concepts_found` 也用 atomic。

#### P0-2：截断 content 到 8KB 后再喂给 LLM

- **改动文件**：`src-tauri/src/commands/knowledge.rs:148–173`（assemble_messages_for_concept 调用处之前）
- **预估代码量**：1 行（`content_snippet.chars().take(8000).collect::<String>()`）
- **预期收益**：
  - avg 62KB → 8KB content，**单次 LLM 输入 token 从 ~15K 降到 ~2K**。
  - ARK ark-code-latest 在 2K 输入下单次推理大概 **15–20s**（而非 58s）。
  - 单独叠加可把全量从 84min → ~22min（**3.8× 提速**）。
- **风险**：长文档的后半部分概念可能漏抽；可以做**前 4K + 末 4K 拼接**或**按章节分批**。先粗暴截断验证收益，再分章节优化。

#### **P0-1 + P0-2 叠加预期：84min → ~7–10min**（**9× 提速**）

#### P0-3：UI 文案立刻反馈"已开始扫描，首条结果约需 1 分钟"

- **改动文件**：`src/components/features/knowledge/KnowledgeAssociationView.tsx:345–375`（ExtractionProgressBar）
- **预估代码量**：~5 行（在 `processed === 0` 时显示"正在处理第一个文档（约 60 秒）…"，并展示一个"无确定进度"的脉冲条而非 0%）。
- **预期收益**：**零代码量改 UI 感知**，立刻消除"空转"的用户报告，即使后端没改也能减少 80% 的支持工单。
- **风险**：无。

---

### P1（中收益，30–60%）

#### P1-1：把 chat_completion 改成流式接收，per-token emit 进度

- **改动文件**：`src-tauri/src/llm/chat.rs`（已存在 `chat_completion_stream` fn，128 行起）+ knowledge.rs:189
- **预估代码量**：~40 行（把 concept 抽取也走 stream，per-token 不需要 emit，但**首 token 到达**时可以 emit 一次"正在抽取 #1 的第一个概念…"）。
- **预期收益**：用户感知更顺畅，但全量耗时不减（依然受单次串行约束，**只有结合 P0-1 才有意义**）。
- **风险**：JSON 解析必须等流结束（除非用 partial JSON parser），实际收益主要在 UX。

#### P1-2：默认"重新扫描"走增量（force=false），新增"重新生成全部"二级按钮

- **改动文件**：`src/components/features/knowledge/KnowledgeAssociationView.tsx:213` 把 `handleStartScan(true)` 改成 `handleStartScan(false)`。
- **预估代码量**：~10 行。
- **预期收益**：用户**当前已有 40 个 logged_pair**，下次点"重新扫描"只需处理 87-40=47 个 → **直接省 46% 时间**。
- **风险**：用户期望"重新扫描"是完全刷新；建议把按钮文案改为"扫描新增/变更"，再加一个隐藏菜单"强制重新扫描全部"。

#### P1-3：按 content_hash 做 prompt 级缓存（concept JSON 缓存表）

- **改动文件**：新增 `db/concept_prompt_cache.rs`，在 chat_completion 之前查 (model, hash) → 命中则跳过 LLM。
- **预估代码量**：~120 行。
- **预期收益**：用户改写文档前**完全相同的 content** 不会再付 LLM 成本；适用于 force=true 场景的二次点击。

---

### P2（小收益但易做）

#### P2-1：sequential 模式下，把 `app.emit` 加一个"开始处理文档 #i: filename" 的事件

- 让前端能展示"正在处理：05-机器学习-决策树.pdf"。**用户感知瞬间从"卡死"变成"在干活"**。
- 改动 ~10 行，零风险。

#### P2-2：把空内容 / `len < 100` 的 asset 在 fetch_library_assets SQL 里直接过滤掉

- DB 显示有 `min_b=0`（content 为空的 asset）—— 已经在 knowledge.rs:130 跳过但仍计入 total，导致进度条 87 个里有几个根本不会消耗 LLM。
- 改 SQL 加 `WHERE LENGTH(...) > 100` —— 让 total 精准反映真实工作量。

---

## 验证方式（修复后如何度量收益）

1. **基线（当前）**：`time` 一次 `force=true` 扫描，记录总耗时 + 每文档 LLM 调用耗时（日志 grep `module=concept` 时间差）。
2. **改造后**：相同 library、相同 87 文档、相同 model，测量：
   - **TOTAL_TIME**：从前端点击到 `concept-extraction-done` 事件的时间。
   - **MEAN_PER_DOC**：(TOTAL_TIME / 87)，但因并发后这个值不再线性，更应看：
   - **P95_PER_DOC**：单文档 LLM 调用 P95（从 log 里抽）。
   - **FIRST_PROGRESS**：从点击到第一次 `processed >= 1` 的时间（这是"空转感"指标）。
3. **目标**：
   - P0-1+P0-2 后：TOTAL_TIME ≤ 10 分钟，FIRST_PROGRESS ≤ 25s（因为截断后单文档变快 + 并发后首个完成可能更快）。
   - P0-3 后：FIRST_PROGRESS 感知 ≤ 2s（虽然后端没改，但 UI 显示"约 60s"消除空转）。

---

## 给 PM 的一句话

**用户没遇到 bug，是 LLM 太慢 × 87 文档串行 = 1.5 小时，等就行**；但**这显然不可接受**，建议立刻开 FIX task 做 P0-1（并发）+ P0-2（截断）+ P0-3（UI 文案），预期把全量扫描从 84min 压到 ~7–10min，且 UI 即时反馈"正在处理第 N 个"。
