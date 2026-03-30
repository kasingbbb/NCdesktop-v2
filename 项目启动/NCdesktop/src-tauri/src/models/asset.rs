use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub project_id: String,
    pub asset_type: String,
    /// 工作区内展示名（可被 AI / 用户重命名）
    pub name: String,
    /// 拖入时的原始文件名，仅副本在应用目录内被整理，此字段用于对照原件
    #[serde(default)]
    pub original_name: String,
    pub file_path: String,
    pub file_size: i64,
    pub mime_type: String,
    pub captured_at: String,
    pub imported_at: String,
    pub source_type: String,
    pub source_data: Option<String>,
    pub is_starred: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIAnalysisRow {
    pub id: String,
    pub asset_id: String,
    pub summary: String,
    pub topics: String,
    pub ocr_text: Option<String>,
    pub language: String,
    pub suggested_tags: String,
    pub suggested_name: String,
}
