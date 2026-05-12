use std::path::Path;

use crate::extraction::{
    models::{ContentSegment, ExtractionError, ExtractionResult, ExtractOptions},
    Extractor,
};

pub struct AudioAsrExtractor;

impl Extractor for AudioAsrExtractor {
    fn can_handle(&self, mime_type: &str) -> bool {
        // 仅在 macOS 上启用；非 macOS 构建永返 false
        #[cfg(target_os = "macos")]
        {
            matches!(
                mime_type,
                "audio/mpeg" | "audio/mp4" | "audio/wav" | "audio/flac" | "audio/x-wav"
            )
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = mime_type;
            false
        }
    }

    fn name(&self) -> &'static str {
        "audio_asr"
    }

    fn extract(
        &self,
        file_path: &Path,
        _options: &ExtractOptions,
    ) -> Result<ExtractionResult, ExtractionError> {
        #[cfg(target_os = "macos")]
        {
            let transcription = crate::macos::asr_ffi::transcribe_audio(file_path)
                .map_err(ExtractionError::OcrError)?;

            let transcription = transcription.trim().to_string();

            if transcription.is_empty() {
                return Ok(ExtractionResult {
                    raw_text: String::new(),
                    structured_md: String::new(),
                    quality_level: 0,
                    extractor_type: "audio_asr".to_string(),
                    segments: vec![],
                    needs_ocr_fallback: false,
                });
            }

            let segments = vec![ContentSegment {
                segment_type: "asr_transcription".to_string(),
                content: transcription.clone(),
                page: None,
                confidence: None,
                bbox: None,
            }];

            Ok(ExtractionResult {
                raw_text: transcription.clone(),
                structured_md: transcription,
                quality_level: 1,
                extractor_type: "audio_asr".to_string(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_can_handle_audio_types() {
        let extractor = AudioAsrExtractor;
        // 在 macOS 上应该能处理
        #[cfg(target_os = "macos")]
        {
            assert!(extractor.can_handle("audio/mpeg"));
            assert!(extractor.can_handle("audio/mp4"));
            assert!(extractor.can_handle("audio/wav"));
            assert!(extractor.can_handle("audio/flac"));
        }
        // 不处理非音频类型
        assert!(!extractor.can_handle("application/pdf"));
        assert!(!extractor.can_handle("image/jpeg"));
        assert!(!extractor.can_handle(""));
    }

    #[test]
    #[cfg(not(target_os = "macos"))]
    fn test_can_handle_returns_false_on_non_macos() {
        let extractor = AudioAsrExtractor;
        assert!(!extractor.can_handle("audio/mpeg"));
        assert!(!extractor.can_handle("audio/mp4"));
    }
}
