use std::path::Path;

use crate::extraction::{
    models::{ContentSegment, ExtractionError, ExtractionResult, ExtractOptions},
    Extractor,
};

pub struct ImageOcrExtractor;

impl Extractor for ImageOcrExtractor {
    fn can_handle(&self, mime_type: &str) -> bool {
        matches!(
            mime_type,
            "image/jpeg" | "image/png" | "image/heic" | "image/webp" | "image/jpg"
        )
    }

    fn name(&self) -> &'static str {
        "vision_ocr"
    }

    fn extract(
        &self,
        file_path: &Path,
        _options: &ExtractOptions,
    ) -> Result<ExtractionResult, ExtractionError> {
        #[cfg(target_os = "macos")]
        {
            let regions =
                crate::macos::ocr_ffi::ocr_image(file_path).map_err(ExtractionError::OcrError)?;

            if regions.is_empty() {
                return Ok(ExtractionResult {
                    raw_text: String::new(),
                    structured_md: String::new(),
                    quality_level: 0,
                    extractor_type: "vision_ocr".to_string(),
                    segments: vec![],
                    needs_ocr_fallback: false,
                });
            }

            // 按 y 坐标排序（从上到下），Vision 的 y 从底部开始所以降序
            let mut sorted_regions = regions.clone();
            sorted_regions.sort_by(|a, b| {
                b.bbox[1]
                    .partial_cmp(&a.bbox[1])
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            let segments: Vec<ContentSegment> = sorted_regions
                .iter()
                .map(|r| ContentSegment {
                    segment_type: "ocr_region".to_string(),
                    content: r.text.clone(),
                    page: None,
                    confidence: Some(r.confidence),
                    bbox: Some(r.bbox),
                })
                .collect();

            let raw_text = sorted_regions
                .iter()
                .map(|r| r.text.as_str())
                .collect::<Vec<_>>()
                .join("\n");

            let structured_md = raw_text.clone();

            Ok(ExtractionResult {
                raw_text,
                structured_md,
                quality_level: 1,
                extractor_type: "vision_ocr".to_string(),
                segments,
                needs_ocr_fallback: false,
            })
        }

        #[cfg(not(target_os = "macos"))]
        {
            Err(ExtractionError::UnsupportedPlatform)
        }
    }
}
