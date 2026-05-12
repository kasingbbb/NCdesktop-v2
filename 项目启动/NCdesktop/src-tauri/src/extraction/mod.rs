pub mod extractors;
pub mod models;
// scheduler 依赖未恢复的 Asset.source_asset_id / db::extraction / sha2 等，暂不激活
// pub mod scheduler;

use std::path::Path;

use models::{ExtractionError, ExtractionResult, ExtractOptions};

/// 提取器 trait — 所有格式的文件内容提取器须实现此接口
pub trait Extractor: Send + Sync {
    /// 判断此提取器是否能处理指定 MIME 类型
    fn can_handle(&self, mime_type: &str) -> bool;

    /// 提取器名称标识
    fn name(&self) -> &'static str;

    /// 执行提取（同步，调用方负责在 spawn_blocking 中运行）
    fn extract(
        &self,
        file_path: &Path,
        options: &ExtractOptions,
    ) -> Result<ExtractionResult, ExtractionError>;
}
