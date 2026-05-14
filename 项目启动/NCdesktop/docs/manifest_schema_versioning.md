# Runtime Manifest Schema Versioning Policy

> **关联文件**：`src-tauri/resources/runtime-manifest.json`（字段 `schema_version`，task_002 引入）、`src-tauri/src/extraction/...`（task_007 自检逻辑）。
>
> **关联文档**：[rollback_sop.md](rollback_sop.md)。

---

## 1. 当前版本

`runtime-manifest.json.schema_version` 当前值：**`1`**（task_002 PASS 后写入，整数语义版本）。

> 校验方式：`jq -r .schema_version src-tauri/resources/runtime-manifest.json` 或 `python3 -c "import json; print(json.load(open('src-tauri/resources/runtime-manifest.json'))['schema_version'])"`。

---

## 2. 何时 bump

采用 **major.minor** 整数对（最早只用单整数 `1`，第一次破坏性变更后转为 `2.0` 字符串或保持整数 major 单调递增——见 §4 实施细节）。

| 变更类型 | bump 方式 | 示例 |
|---------|----------|------|
| **新增可选字段** | minor (`1 → 1.1`) | 增加 `markitdown.optional_extras` 字段，老代码忽略即可 |
| **新增带缺省值的必填字段** | minor (`1 → 1.1`) | 增加 `arch_secondary`，老 manifest 无此字段时按 `null` 处理 |
| **删除字段** | major (`1 → 2`) | 移除 `extras_extra`，老代码读到 `KeyError` |
| **字段语义变更** | major (`1 → 2`) | `python.version` 由字符串改为对象 `{major, minor, patch}` |
| **字段重命名** | major (`1 → 2`) | `markitdown.extras` → `markitdown.installed_extras` |
| **枚举值收紧** | major (`1 → 2`) | `arch` 由任意字符串收紧为 `arm64 | x86_64` |

> **指导原则**：若一台老应用读到新 manifest 后**无法继续正常工作**，必须 bump major。仅追加的、可被 `serde(default)` 优雅降级的变更是 minor。

---

## 3. 老 manifest 在新应用启动时的兼容策略

### 3.1 major 不兼容（应用 schema_version > manifest schema_version 的 major）

- **行为**：task_007 的自检逻辑必须返回 `FailureCode::ERuntimeMissing`（或新增 `ERuntimeSchemaTooOld`，需 Reviewer 审批）。
- **UI 表现**：横幅展示「检测到运行时元数据版本过旧（manifest schema vX，应用要求 vY），请重新下载安装包」+ 重装链接。
- **不允许**：尝试"猜测"老字段语义并继续运行 —— 数据损坏代价远高于强制重装。

### 3.2 minor 兼容（major 相同，应用 minor > manifest minor）

- **行为**：Rust 结构体在所有新字段上加 `#[serde(default)]`，老 manifest 缺失字段时使用类型默认值。
- **观测**：启动时日志 WARN 级输出「manifest schema v1.0 落后于应用要求 v1.1，已用缺省值降级」，不阻塞启动。
- **遥测**：增加计数器 `manifest_schema_minor_drift_total`，便于运营观察灰度推进。

### 3.3 应用 schema_version < manifest schema_version（前向）

> 极少发生（出现意味着 manifest 来自更新的 runtime 包却被老应用加载，通常是用户手动替换文件）。
- **major 高于应用**：拒绝启动，提示「运行时元数据版本超前于应用，请升级应用或回滚 runtime」。
- **minor 高于应用**：WARN 后继续启动，忽略未知字段（Rust serde 默认行为）。

---

## 4. 实施细节

### 4.1 当前字段类型

当前 `schema_version` 在 task_002 写入时为**整数** `1`。第一次破坏性变更将切换为字符串 `"2.0"`（语义兼容：整数 `1` 等价 `"1.0"`）。

Rust 端解析建议：

```rust
#[derive(Deserialize)]
#[serde(untagged)]
enum SchemaVersion {
    Legacy(u32),       // 老 manifest 写整数
    Semantic(String),  // "2.0" / "2.1" / ...
}
```

### 4.2 与 DMG version 的强解耦

| 维度 | DMG version | manifest schema_version |
|------|------------|------------------------|
| 来源 | `tauri.conf.json` `.version` | `src-tauri/resources/runtime-manifest.json` `.schema_version` |
| 节奏 | 每次发布 bump（语义化） | 仅在 manifest 结构变化时 bump |
| 示例 | 1.2.3 / 1.2.4 / 1.3.0（每周/双周） | 1（数月不变）→ 1.1（新增字段）→ 2（破坏性） |
| Release 关系 | DMG 1.5.0 可以仍然携带 schema 1；DMG 2.0.0 不必然伴随 schema bump | 反之亦然 |

> **红线**：CI/Reviewer 看到 PR 中 `tauri.conf.json` 改了 version 就**强制**改 `schema_version`，反之亦然，均属错误耦合，应驳回。

### 4.3 Schema 变更评审流程

任何修改 `runtime-manifest.json` 字段结构（不是数值更新）的 PR 必须：

1. **task_007 dev 复核**：原 task_007 实现者（或当前 self-check 模块 owner）确认兼容策略已落地（major 拒启 / minor 默认值）。
2. **Reviewer 二次评审**：独立 reviewer 验证：
   - schema_version 是否正确 bump（major vs minor）；
   - 老 manifest 兼容路径是否有测试用例；
   - 本文档 §1 当前版本是否同步更新。
3. **不允许单签字合入**：与 rollback_sop.md 双签字 SOP 一致。
