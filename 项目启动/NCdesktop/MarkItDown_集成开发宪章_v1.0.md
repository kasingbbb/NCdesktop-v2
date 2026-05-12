# NCdesktop × MarkItDown 集成开发宪章 v1.0

> **文档性质**：这是可直接落地执行的逐步开发指南，基于对当前代码库的完整分析和 `microsoft/markitdown 0.1.5` 的能力研究编写。每一步都有精确的文件路径、函数名、代码修改点，和可测试的验收标准。
>
> **版本**：v1.0 / 2026-04-22  
> **对应规划文档**：`MarkItDown_文件格式转化迭代规划宪章_v1.0.md`  
> **代码基线**：以下分析基于当前 `main` 分支实际代码

---

## 代码库现状速览

在开始前，务必理解当前管线的真实结构：

```
用户拖拽文件
  → import_drop_paths()                    [commands/dropzone.rs:475]
    → Asset 落库 + 复制到工作区
    → PipelineScheduler::enqueue()         [extraction/scheduler.rs:23]
    → spawn_dropzone_ai_job() (异步)       [commands/dropzone.rs:398]
      → apply_llm_classify_to_asset()      [commands/dropzone.rs:310]
        → db::tag::link_to_asset()         ← 标签只写到原始 asset ❌
        
  → PipelineScheduler::start() 循环
    → 按 MIME 选 Extractor                 [extraction/extractors/mod.rs:12]
    → extractor.extract()
    → db_save_extraction_result()          [extraction/scheduler.rs:297]
    → materialize_md()                     [extraction/scheduler.rs:342]
      → 写 .md 文件
      → 插入衍生 Asset (source_asset_id)
      → 没有继承标签                        ← 核心缺陷 ❌
      → 每次重跑都生成新 UUID 新文件         ← 幂等缺陷 ❌
```

**关键数据模型字段（已存在）：**
- `assets.source_asset_id` — 已有，衍生件指向原件
- `asset_tags (asset_id, tag_id)` — 联结表，有 ON DELETE CASCADE
- `extracted_content.status` — pending|extracting|extracted|failed|unsupported
- `extracted_content.extractor_type` — 记录使用的提取器名称

---

## Step 1：修复标签继承 Bug（Phase 0 / M1）

**目标**：上传文件后生成的 `.md` 衍生件，自动继承原文件的全部标签。  
**影响范围**：`extraction/scheduler.rs`、`db/tag.rs`  
**预计工时**：1-2 天  
**无需任何新依赖**

### 1.1 在 `db/tag.rs` 新增标签传播函数

**文件**：`src-tauri/src/db/tag.rs`

在现有 `link_to_asset()` 函数（当前约第 106 行）之后，追加：

```rust
/// 将 root_asset 的所有标签复制到 derived_asset
/// 使用 INSERT OR IGNORE 保证幂等，不报错
pub fn propagate_tags_to_derivative(
    conn: &Connection,
    root_asset_id: &str,
    derived_asset_id: &str,
) -> rusqlite::Result<usize> {
    conn.execute(
        "INSERT OR IGNORE INTO asset_tags (asset_id, tag_id)
         SELECT ?1, tag_id FROM asset_tags WHERE asset_id = ?2",
        rusqlite::params![derived_asset_id, root_asset_id],
    )
}

/// 当原件新增标签时，同步到其所有 canonical markdown 衍生件
pub fn sync_tags_to_canonical_derivatives(
    conn: &Connection,
    root_asset_id: &str,
) -> rusqlite::Result<usize> {
    conn.execute(
        "INSERT OR IGNORE INTO asset_tags (asset_id, tag_id)
         SELECT a.id, at.tag_id
         FROM assets a
         JOIN asset_tags at ON at.asset_id = ?1
         WHERE a.source_asset_id = ?1
           AND a.asset_type = 'markdown'",
        rusqlite::params![root_asset_id],
    )
}
```

### 1.2 在 `materialize_md()` 插入衍生 asset 后调用传播

**文件**：`src-tauri/src/extraction/scheduler.rs`

找到 `materialize_md()` 中 asset 插入成功的位置（约第 388-401 行，`db::asset::insert()` 成功分支后），在 `emit "notecapt/asset-converted"` 事件前追加：

```rust
// 继承原件标签到衍生 Markdown 资产
let conn = app.state::<Database>().get().unwrap(); // 获取连接，按项目实际写法调整
if let Err(e) = db::tag::propagate_tags_to_derivative(&conn, &source_asset.id, &derived_id) {
    warn!("标签继承失败 {} -> {}: {}", source_asset.id, derived_id, e);
    // 非致命错误，继续执行
}
```

> **注意**：`conn` 的获取方式要与项目中其他 `materialize_md` 内的 db 调用保持一致。该函数目前通过 `app: &AppHandle` 访问数据库，参照 `db::asset::insert()` 的调用方式取连接。

### 1.3 在 AI 打标完成后，同步到现有衍生件

**文件**：`src-tauri/src/commands/dropzone.rs`

找到 `apply_llm_classify_to_asset()` 中完成标签写入的位置（约第 375-393 行，`db::tag::link_to_asset()` 调用之后），追加：

```rust
// AI 打标完成后，同步到已有的 canonical markdown 衍生件
if let Err(e) = db::tag::sync_tags_to_canonical_derivatives(&conn, &asset.id) {
    warn!("AI 标签同步到衍生件失败 {}: {}", asset.id, e);
}
```

### 1.4 验收测试

1. 拖入一个 PDF 文件
2. 等待 AI 分类完成（标签出现在原件）
3. 等待提取完成（出现 `.md` 衍生件）
4. 打开 Inspector 面板检查 `.md` 文件，应能看到与原 PDF 相同的标签
5. 在 TagTree 中点击标签，`.md` 文件应出现在过滤结果中

---

## Step 2：物化幂等改造（Phase 1 / M2）

**目标**：同一原件重复提取，不产生多余 `.md` 副本，而是更新现有衍生件。  
**影响范围**：`extraction/scheduler.rs`、`db/asset.rs`  
**预计工时**：1-2 天

### 2.1 在 `db/asset.rs` 新增查询衍生件函数

**文件**：`src-tauri/src/db/asset.rs`

```rust
/// 查找某原件的 canonical markdown 衍生件（如有）
pub fn find_markdown_derivative(
    conn: &Connection,
    root_asset_id: &str,
) -> rusqlite::Result<Option<Asset>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM assets
         WHERE source_asset_id = ?1
           AND asset_type = 'markdown'
         ORDER BY imported_at DESC
         LIMIT 1",
    )?;
    let result = stmt.query_row(rusqlite::params![root_asset_id], |row| {
        // 与现有 Asset::from_row 保持一致
        Asset::from_row(row)
    });
    match result {
        Ok(asset) => Ok(Some(asset)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// 更新衍生 markdown 资产的文件内容和元数据
pub fn update_markdown_derivative(
    conn: &Connection,
    derived_asset_id: &str,
    new_file_size: i64,
    new_imported_at: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE assets SET file_size = ?1, imported_at = ?2 WHERE id = ?3",
        rusqlite::params![new_file_size, new_imported_at, derived_asset_id],
    )?;
    Ok(())
}
```

### 2.2 改造 `materialize_md()` 实现幂等逻辑

**文件**：`src-tauri/src/extraction/scheduler.rs`

将现有 `materialize_md()` 改造为先查后写的幂等策略：

```rust
fn materialize_md(app: &AppHandle, source_asset: &Asset, md_content: &str) {
    // 1. 确保工作区目录
    let workspace_dir = match workspace::ensure_project_workspace(&source_asset.project_id) {
        Ok(d) => d,
        Err(e) => { warn!("工作区创建失败: {}", e); return; }
    };

    let conn = /* 按项目方式获取连接 */;

    // 2. 检查是否已有 canonical markdown 衍生件
    match db::asset::find_markdown_derivative(&conn, &source_asset.id) {
        Ok(Some(existing)) => {
            // 2a. 已有衍生件 → 覆盖文件，更新数据库，不生成新 UUID
            if let Err(e) = std::fs::write(&existing.file_path, md_content) {
                warn!("覆盖 MD 文件失败 {}: {}", existing.file_path, e);
                return;
            }
            let now = chrono::Utc::now().to_rfc3339();
            let _ = db::asset::update_markdown_derivative(
                &conn,
                &existing.id,
                md_content.len() as i64,
                &now,
            );
            // 同步标签（覆盖后重新传播，防止原件增加了新标签）
            let _ = db::tag::propagate_tags_to_derivative(&conn, &source_asset.id, &existing.id);
            // 通知前端刷新
            let _ = app.emit_all("notecapt/asset-converted", serde_json::json!({
                "sourceAssetId": source_asset.id,
                "derivedAssetId": existing.id,
                "projectId": source_asset.project_id,
                "isUpdate": true,
            }));
            info!("幂等更新 MD: {} -> {} ({})", source_asset.id, existing.id, existing.file_path);
        }
        Ok(None) => {
            // 2b. 尚无衍生件 → 首次创建（原有逻辑）
            let stem = Path::new(&source_asset.name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("document");
            let derived_id = uuid::Uuid::new_v4().to_string();
            let md_display_name = format!("{}.md", stem);
            let md_file_name = format!("{}_{}", derived_id, md_display_name);
            let md_path = workspace_dir.join(&md_file_name);

            if let Err(e) = std::fs::write(&md_path, md_content) {
                warn!("写 MD 文件失败: {}", e);
                return;
            }

            let now = chrono::Utc::now().to_rfc3339();
            let derived_asset = Asset {
                id: derived_id.clone(),
                project_id: source_asset.project_id.clone(),
                asset_type: "markdown".to_string(),
                name: md_display_name.clone(),
                original_name: md_display_name,
                file_path: md_path.to_string_lossy().to_string(),
                file_size: md_content.len() as i64,
                mime_type: "text/markdown".to_string(),
                captured_at: now.clone(),
                imported_at: now,
                source_type: "converted_from".to_string(),
                source_data: Some(source_asset.id.clone()),
                is_starred: false,
                source_asset_id: Some(source_asset.id.clone()),
            };

            if let Err(e) = db::asset::insert(&conn, &derived_asset) {
                let _ = std::fs::remove_file(&md_path);
                warn!("衍生 Asset 入库失败: {}", e);
                return;
            }

            // 首次创建也继承标签
            let _ = db::tag::propagate_tags_to_derivative(&conn, &source_asset.id, &derived_id);

            let _ = app.emit_all("notecapt/asset-converted", serde_json::json!({
                "sourceAssetId": source_asset.id,
                "derivedAssetId": derived_id,
                "projectId": source_asset.project_id,
                "isUpdate": false,
            }));
            info!("物化 MD 成功: {} -> {} ({})", source_asset.id, derived_id, md_path.display());
        }
        Err(e) => {
            warn!("查询衍生件失败: {}", e);
        }
    }
}
```

### 2.3 验收测试

1. 拖入同一 PDF 两次（或手动重触发提取）
2. 工作区中应只有一个 `.md` 文件，不会有 `uuid1_xxx.md` + `uuid2_xxx.md` 两个副本
3. 第二次提取后文件内容被更新，`imported_at` 时间戳更新

---

## Step 3：转换器抽象层重构（Phase 1 / M2）

**目标**：在现有 `Extractor` trait 之上引入 `ConversionResult` 模型和转换器元数据，为接入 MarkItDown 预留干净接口。  
**影响范围**：新增文件、对现有 scheduler 最小化改动  
**预计工时**：2-3 天

### 3.1 新建转换结果模型

**新文件**：`src-tauri/src/extraction/conversion.rs`

```rust
use serde::{Deserialize, Serialize};

/// 统一转换结果，替代直接使用 ExtractionResult 物化
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversionResult {
    pub markdown: String,
    pub converter_name: String,      // "markitdown" | "pdf_text" | "vision_ocr" | ...
    pub converter_version: String,   // "0.1.5" | "builtin"
    pub source_mime: String,
    pub source_hash: String,         // SHA256 of source file bytes
    pub quality_level: i32,          // 0=failed, 1=ocr, 2=structured
    pub fallback_used: bool,
    pub error_class: Option<String>, // None if success
    pub conversion_ms: u64,          // elapsed milliseconds
}

/// 转换器 trait，兼容现有 Extractor
pub trait Converter: Send + Sync {
    fn name(&self) -> &'static str;
    fn version(&self) -> &'static str { "builtin" }
    fn can_handle(&self, mime_type: &str) -> bool;
    fn convert(&self, file_path: &std::path::Path, mime_type: &str) -> Result<ConversionResult, String>;
}

/// 计算文件 SHA256（用于幂等检查）
pub fn file_sha256(path: &std::path::Path) -> std::io::Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = sha2::Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 { break; }
        sha2::Digest::update(&mut hasher, &buf[..n]);
    }
    Ok(format!("{:x}", sha2::Digest::finalize(hasher)))
}
```

> 需在 `Cargo.toml` 追加依赖：`sha2 = "0.10"`

### 3.2 新增数据库迁移：conversion_meta 表

**文件**：`src-tauri/src/db/migrations.rs`（在最后一个版本号之后追加新迁移）

```sql
-- V{N}: 转换元数据表
CREATE TABLE IF NOT EXISTS conversion_meta (
    id                   TEXT PRIMARY KEY,
    source_asset_id      TEXT NOT NULL,
    derived_asset_id     TEXT,           -- 物化成功后填入
    converter_name       TEXT NOT NULL,
    converter_version    TEXT NOT NULL DEFAULT 'builtin',
    source_mime          TEXT NOT NULL,
    source_hash          TEXT NOT NULL,
    quality_level        INTEGER NOT NULL DEFAULT 0,
    fallback_used        INTEGER NOT NULL DEFAULT 0,
    error_class          TEXT,
    conversion_ms        INTEGER,
    converted_at         TEXT NOT NULL,
    UNIQUE(source_asset_id, converter_name)  -- 同一原件+转换器组合唯一
);

CREATE INDEX IF NOT EXISTS idx_cm_source ON conversion_meta(source_asset_id);
CREATE INDEX IF NOT EXISTS idx_cm_derived ON conversion_meta(derived_asset_id);
```

### 3.3 验收标准

- `conversion.rs` 编译通过
- 迁移执行后 `conversion_meta` 表存在
- 现有提取功能不受影响（暂不接 Converter trait，下一步再接）

---

## Step 4：MarkItDown 运行时检测与适配层（Phase 2 / M3）

**目标**：新建 `markitdown_adapter`，封装 Python 子进程调用，处理健康检查、版本探测、错误边界。  
**影响范围**：新增文件  
**预计工时**：3-4 天

### 4.1 markitdown 安装与健康检查命令

**新文件**：`src-tauri/src/extraction/extractors/markitdown_adapter.rs`

```rust
use std::path::Path;
use std::process::Command;
use std::time::Instant;

use super::super::conversion::{ConversionResult, Converter, file_sha256};

pub struct MarkItDownAdapter {
    python_path: String,  // e.g. "python3" or "/path/to/venv/bin/python"
}

impl MarkItDownAdapter {
    /// 创建适配器，自动探测可用的 Python
    pub fn new() -> Option<Self> {
        for python in &["python3", "python", "/usr/local/bin/python3"] {
            if Self::probe_markitdown(python).is_ok() {
                return Some(Self { python_path: python.to_string() });
            }
        }
        None
    }

    /// 检测 markitdown 是否可用，返回版本字符串
    pub fn probe_markitdown(python: &str) -> Result<String, String> {
        let output = Command::new(python)
            .args(["-c", "import markitdown; print(markitdown.__version__)"])
            .output()
            .map_err(|e| format!("Python 不可用: {}", e))?;

        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(version)
        } else {
            Err(format!(
                "markitdown 未安装: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    fn run_conversion(&self, file_path: &Path) -> Result<String, String> {
        let output = Command::new(&self.python_path)
            .args(["-m", "markitdown"])
            .arg(file_path)
            .output()
            .map_err(|e| format!("子进程启动失败: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Err(format!("markitdown 退出码 {:?}: {}", output.status.code(), stderr))
        }
    }
}

impl Converter for MarkItDownAdapter {
    fn name(&self) -> &'static str { "markitdown" }

    fn version(&self) -> &'static str {
        // 实际应缓存 probe 结果，此处简化
        "0.1.5"
    }

    fn can_handle(&self, mime_type: &str) -> bool {
        matches!(
            mime_type,
            "application/pdf"
            | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            | "application/vnd.ms-excel"
            | "text/html"
            | "text/csv"
        )
    }

    fn convert(&self, file_path: &Path, mime_type: &str) -> Result<ConversionResult, String> {
        let start = Instant::now();
        let source_hash = file_sha256(file_path)
            .unwrap_or_else(|_| "unknown".to_string());

        match self.run_conversion(file_path) {
            Ok(markdown) => {
                let quality = assess_markdown_quality(&markdown);
                Ok(ConversionResult {
                    markdown,
                    converter_name: "markitdown".to_string(),
                    converter_version: "0.1.5".to_string(),
                    source_mime: mime_type.to_string(),
                    source_hash,
                    quality_level: quality,
                    fallback_used: false,
                    error_class: None,
                    conversion_ms: start.elapsed().as_millis() as u64,
                })
            }
            Err(e) => {
                Ok(ConversionResult {
                    markdown: String::new(),
                    converter_name: "markitdown".to_string(),
                    converter_version: "0.1.5".to_string(),
                    source_mime: mime_type.to_string(),
                    source_hash,
                    quality_level: 0,
                    fallback_used: false,
                    error_class: Some(classify_error(&e)),
                    conversion_ms: start.elapsed().as_millis() as u64,
                })
            }
        }
    }
}

/// 简单质量评估：通过 Markdown 结构信号判断质量等级
fn assess_markdown_quality(md: &str) -> i32 {
    if md.trim().is_empty() { return 0; }
    let char_count = md.chars().count();
    if char_count < 50 { return 0; }

    let has_headings = md.contains("\n#");
    let has_lists = md.contains("\n- ") || md.contains("\n* ") || md.contains("\n1.");
    let has_tables = md.contains("| ---");

    if has_headings || has_lists || has_tables {
        2  // 结构化内容
    } else if char_count > 200 {
        1  // 纯文字，有实质内容
    } else {
        0
    }
}

/// 将 stderr 错误字符串归类为错误类型
fn classify_error(stderr: &str) -> String {
    if stderr.contains("FileNotFoundError") || stderr.contains("No such file") {
        "file_not_found".to_string()
    } else if stderr.contains("PermissionError") {
        "permission_denied".to_string()
    } else if stderr.contains("UnsupportedFormatException") || stderr.contains("not supported") {
        "unsupported_format".to_string()
    } else if stderr.contains("ModuleNotFoundError") {
        "markitdown_not_installed".to_string()
    } else {
        "conversion_error".to_string()
    }
}
```

### 4.2 在 `extractors/mod.rs` 中注册适配器状态

**文件**：`src-tauri/src/extraction/extractors/mod.rs`

在 `create_extractor_list()` 或初始化位置，增加全局单例检查：

```rust
use super::super::extraction::extractors::markitdown_adapter::MarkItDownAdapter;

/// 在 app 启动时调用，检测 MarkItDown 可用性并记录日志
pub fn init_markitdown_health_check() -> Option<MarkItDownAdapter> {
    match MarkItDownAdapter::new() {
        Some(adapter) => {
            info!("MarkItDown 可用，版本: {}", adapter.version());
            Some(adapter)
        }
        None => {
            warn!("MarkItDown 不可用，将使用内置提取器 fallback");
            None
        }
    }
}
```

### 4.3 新增 Tauri 命令：健康检查

**文件**：`src-tauri/src/commands/`（新建或追加到 `system.rs`）

```rust
#[tauri::command]
pub async fn check_markitdown_status() -> serde_json::Value {
    match MarkItDownAdapter::probe_markitdown("python3")
        .or_else(|_| MarkItDownAdapter::probe_markitdown("python"))
    {
        Ok(version) => serde_json::json!({
            "available": true,
            "version": version,
            "python": "python3"
        }),
        Err(reason) => serde_json::json!({
            "available": false,
            "reason": reason,
            "install_hint": "pip install markitdown[all]"
        }),
    }
}
```

### 4.4 验收标准

- 在项目根目录执行 `pip install markitdown[all]` 后，`check_markitdown_status` 命令返回 `available: true`
- 未安装时返回 `available: false` 和安装提示，不 panic
- 适配器可以对一个真实 PDF 调用 `convert()`，返回非空 markdown

---

## Step 5：将 MarkItDown 接入主转换路径（Phase 2 / M3）

**目标**：PDF / DOCX / PPTX / XLSX 优先走 MarkItDown，失败时自动 fallback 到内置提取器。  
**影响范围**：`extraction/scheduler.rs` 主循环  
**预计工时**：3-4 天

### 5.1 改造 scheduler 主循环的转换分支

**文件**：`src-tauri/src/extraction/scheduler.rs`

在 `start()` 方法内，找到当前的提取器选择和调用逻辑（约第 141-177 行）。改造为：

```rust
// 优先尝试 MarkItDown（适用于文档类格式）
let (md_content, extractor_used, quality) = if should_use_markitdown(&asset.mime_type) {
    let adapter = MarkItDownAdapter::new();
    match adapter {
        Some(a) => {
            match a.convert(Path::new(&asset.file_path), &asset.mime_type) {
                Ok(result) if result.quality_level > 0 => {
                    info!("MarkItDown 转换成功: {} 质量={}", asset.id, result.quality_level);
                    // 写入 conversion_meta
                    let _ = db_save_conversion_meta(&conn, &asset, &result, None);
                    (result.markdown, "markitdown".to_string(), result.quality_level)
                }
                Ok(failed_result) => {
                    warn!("MarkItDown 输出为空，fallback 到内置提取器: {}", asset.id);
                    let _ = db_save_conversion_meta(&conn, &asset, &failed_result, Some("empty_output"));
                    run_builtin_extractor(&app, &asset, &extractors)
                }
                Err(e) => {
                    warn!("MarkItDown 异常 fallback: {} - {}", asset.id, e);
                    run_builtin_extractor(&app, &asset, &extractors)
                }
            }
        }
        None => {
            // MarkItDown 未安装，直接走内置
            run_builtin_extractor(&app, &asset, &extractors)
        }
    }
} else {
    // 不适合 MarkItDown 的格式（图片OCR、音频ASR等）直接走内置
    run_builtin_extractor(&app, &asset, &extractors)
};
```

**辅助函数：**

```rust
/// 判断是否应优先使用 MarkItDown
fn should_use_markitdown(mime_type: &str) -> bool {
    matches!(
        mime_type,
        "application/pdf"
        | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
}

/// 运行内置提取器（封装原有逻辑）
fn run_builtin_extractor(
    app: &AppHandle,
    asset: &Asset,
    extractors: &[Box<dyn Extractor>],
) -> (String, String, i32) {
    // 原有的 extractor.extract() 逻辑提取后返回
    // 返回 (markdown_content, extractor_name, quality_level)
    // 将现有 scheduler.rs 第 141-177 行逻辑包装于此
    todo!("将原有 extractor 逻辑提取到此函数")
}
```

### 5.2 fallback 链路定义

```
PDF      → MarkItDown → 空/失败 → pdf_text.rs → 空 → pdf_scan.rs (OCR)
DOCX     → MarkItDown → 空/失败 → docx.rs
PPTX     → MarkItDown → 空/失败 → pptx.rs
XLSX     → MarkItDown → 空/失败 → (无内置，记录 unsupported)
图片     → image_ocr.rs (macOS Vision，不经 MarkItDown)
音频     → audio_asr.rs (不经 MarkItDown)
TXT/MD   → text.rs (不经 MarkItDown)
```

### 5.3 验收标准

1. 拖入一个 PDF，等待提取完成，查看 `extracted_content.extractor_type` 字段，值为 `"markitdown"`
2. 断开 MarkItDown（重命名 markitdown 包），重跑提取，自动 fallback，`extractor_type` 变为 `"pdf_text"`，不报错不崩溃
3. DOCX、PPTX 文件同样走 MarkItDown 主路径
4. 图片、音频、TXT 仍走原有路径，不受影响
5. `conversion_meta` 表有记录，含 `converter_name`、`quality_level`、`fallback_used`

---

## Step 6：前端状态透传（Phase 3 / M4）

**目标**：让用户能看到"转换器来源"、"质量等级"、"转换失败原因"，并能手动重新触发转换。  
**影响范围**：前端 Inspector 面板、新增 Tauri 命令  
**预计工时**：2-3 天

### 6.1 新增后端命令：获取转换元数据

```rust
#[tauri::command]
pub async fn get_conversion_meta(asset_id: String, database: State<'_, Database>) 
    -> Result<Option<ConversionMetaRow>, String> 
{
    // 查询 conversion_meta WHERE source_asset_id = asset_id
    // 返回转换器、版本、质量、耗时、错误类型等
}

#[tauri::command]
pub async fn retrigger_extraction(
    asset_id: String,
    app: AppHandle,
    database: State<'_, Database>,
) -> Result<(), String> {
    // 1. 重置 extracted_content.status = 'queued'
    // 2. 重置 pipeline_tasks.status = 'queued', retry_count = 0
    // 3. 重启 scheduler
}
```

### 6.2 Inspector 面板新增"转换信息"区域

在 Inspector 中展示（以下为前端字段映射）：

| UI 显示 | 后端字段 |
|---------|---------|
| 转换器 | `conversion_meta.converter_name` |
| 转换器版本 | `conversion_meta.converter_version` |
| 质量等级 | `conversion_meta.quality_level`（图标：✓/⚠/✗） |
| 是否用了 fallback | `conversion_meta.fallback_used` |
| 转换耗时 | `conversion_meta.conversion_ms` ms |
| 失败原因 | `conversion_meta.error_class` |
| [重新转换] 按钮 | 调用 `retrigger_extraction` |

### 6.3 验收标准

- Inspector 展示当前文件的转换来源（markitdown vs 内置）
- 转换失败的文件有明确的失败原因文字，不是空状态
- 点击"重新转换"按钮能重新触发提取

---

## Step 7：资产家族与知识下游对齐（Phase 4 / M5）

**目标**：搜索、知识抽取统一基于 canonical markdown 工作，不再被各格式解析细节拖着走。  
**影响范围**：搜索模块、知识抽取模块  
**预计工时**：根据知识模块现状而定，本文档仅列出接口要求

### 7.1 搜索模块要求

- 全文搜索时，对有 `source_asset_id` 的 markdown 资产，搜索结果命中后应显示原件信息（名称、图标）
- 按标签过滤时，原件和衍生 markdown 均应命中（当前已通过 Step 1 修复）
- 搜索不应对同一原件返回原件+衍生件两条重复结果（应合并或优先展示衍生件）

### 7.2 知识抽取模块要求

- 优先读取 `asset_type = 'markdown'` 且 `source_asset_id IS NOT NULL` 的衍生件内容
- 若衍生件不存在，再读取 `extracted_content.structured_md`
- 确保知识抽取不直接读原始 PDF/DOCX 二进制

---

## 实施顺序总结

```
Step 1  标签继承 bug 修复（无风险，立即可做）
  ↓
Step 2  物化幂等改造（保证系统健壮性）
  ↓
Step 3  转换器抽象层（为 MarkItDown 预留接口）
  ↓
Step 4  MarkItDown 适配层（Python 子进程封装）
  ↓
Step 5  接入主转换路径（含 fallback 链路）
  ↓
Step 6  前端状态透传（可观测性）
  ↓
Step 7  知识下游对齐（可与 Step 5/6 并行）
```

**严格禁止跳步**：Step 3 的抽象层必须在 Step 4 之前完成，否则适配器写完无处挂载。

---

## 关键文件路径速查

| 文件 | 主要改动 |
|------|---------|
| `src-tauri/src/db/tag.rs` | Step 1: 新增 `propagate_tags_to_derivative`、`sync_tags_to_canonical_derivatives` |
| `src-tauri/src/db/asset.rs` | Step 2: 新增 `find_markdown_derivative`、`update_markdown_derivative` |
| `src-tauri/src/extraction/scheduler.rs` | Step 1+2: 改造 `materialize_md`；Step 5: 改造主循环 |
| `src-tauri/src/extraction/conversion.rs` | Step 3: 新建 `ConversionResult`、`Converter` trait |
| `src-tauri/src/extraction/extractors/markitdown_adapter.rs` | Step 4: 新建 MarkItDown 适配器 |
| `src-tauri/src/db/migrations.rs` | Step 3: 新增 `conversion_meta` 表迁移 |
| `src-tauri/src/commands/system.rs` | Step 4+6: 新增健康检查、重新触发命令 |
| `Cargo.toml` | Step 3: 新增 `sha2` 依赖 |

---

## 环境要求

| 阶段 | Python 要求 |
|------|------------|
| Step 1-3 | 无 |
| Step 4-5（开发期）| 系统 Python 3.10+，手动 `pip install markitdown[all]` |
| 内测期 | 应用首次启动自动创建 venv 并安装（需实现安装向导） |
| 正式版 | 评估是否随包内嵌 Python 运行时 |

**最低安装命令：**
```bash
pip install markitdown[all]
# 验证：
markitdown --version  # 或 python3 -m markitdown --version
```

---

## 测试样本集（与规划宪章对齐）

Step 5 完成后必须用以下样本验收：

| 样本 | 期望结果 | 验证点 |
|------|---------|--------|
| 文字型 PDF（学术论文） | MarkItDown 主路径，quality=2 | 有标题/段落结构 |
| 扫描型 PDF | MarkItDown 失败→fallback OCR | quality=1，fallback_used=true |
| DOCX（带标题/表格） | MarkItDown 主路径 | 表格转为 MD 表格语法 |
| PPTX（带层级标题） | MarkItDown 主路径 | 幻灯片标题作为 H2 |
| XLSX（多 sheet） | MarkItDown 主路径 | 每个 sheet 转为 MD 表格 |
| 图片（JPG） | image_ocr.rs，不走 MarkItDown | OCR 文字 |
| 音频（MP3） | audio_asr.rs，不走 MarkItDown | 转写文字 |
| 中文文件名 PDF | 正常处理 | 文件名不乱码 |
| 重复导入同一 PDF | 幂等，只有一个 .md | 无新副本 |
