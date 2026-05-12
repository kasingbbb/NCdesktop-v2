use std::path::Path;
use std::process::Command;

use crate::extraction::{
    models::{
        evaluate_markdown_quality, markdown_to_segments, ExtractionError, ExtractionResult,
        ExtractOptions,
    },
    Extractor,
};

pub struct MarkItDownExtractor;

const SUPPORTED_MIME_TYPES: &[&str] = &[
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/html",
    "application/epub+zip",
];

impl Extractor for MarkItDownExtractor {
    fn can_handle(&self, mime_type: &str) -> bool {
        supports_mime(mime_type)
    }

    fn name(&self) -> &'static str {
        "markitdown"
    }

    fn extract(
        &self,
        file_path: &Path,
        options: &ExtractOptions,
    ) -> Result<ExtractionResult, ExtractionError> {
        if !options.markitdown_enabled {
            return Err(ExtractionError::UnsupportedFormat(
                "MarkItDown 已禁用".to_string(),
            ));
        }

        let file_arg = file_path
            .to_str()
            .ok_or_else(|| ExtractionError::ParseError("文件路径不是有效 UTF-8".to_string()))?;

        let mut attempts = Vec::new();
        for python_cmd in python_candidates(options) {
            match Command::new(&python_cmd)
                .args(["-m", "markitdown", file_arg])
                .output()
            {
                Ok(output) if output.status.success() => {
                    let markdown = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if markdown.is_empty() {
                        attempts.push(format!("{python_cmd}: 输出为空"));
                        continue;
                    }

                    let quality_level = evaluate_markdown_quality(&markdown);
                    return Ok(ExtractionResult {
                        raw_text: markdown.clone(),
                        structured_md: markdown.clone(),
                        quality_level,
                        extractor_type: "markitdown".to_string(),
                        segments: markdown_to_segments(&markdown),
                        needs_ocr_fallback: false,
                    });
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    let msg = if stderr.is_empty() {
                        format!("{python_cmd}: 退出码 {:?}", output.status.code())
                    } else {
                        format!("{python_cmd}: {stderr}")
                    };
                    attempts.push(msg);
                }
                Err(err) => {
                    attempts.push(format!("{python_cmd}: {err}"));
                }
            }
        }

        Err(ExtractionError::ParseError(format!(
            "MarkItDown 调用失败：{}",
            attempts.join(" | ")
        )))
    }
}

pub fn supports_mime(mime_type: &str) -> bool {
    SUPPORTED_MIME_TYPES.contains(&mime_type)
}

fn python_candidates(options: &ExtractOptions) -> Vec<String> {
    let mut candidates = Vec::new();
    if let Some(cmd) = options
        .markitdown_python_cmd
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        candidates.push(cmd.to_string());
    }
    if !candidates.iter().any(|c| c == "python3") {
        candidates.push("python3".to_string());
    }
    if !candidates.iter().any(|c| c == "python") {
        candidates.push("python".to_string());
    }
    candidates
}
