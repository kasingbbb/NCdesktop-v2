use super::Extractor;
use crate::extraction::models::ExtractOptions;

// audio_asr / image_ocr / pdf_scan 依赖未启用的 macos FFI（Swift bridge 未编译），暂不激活
// pub mod audio_asr;
// pub mod image_ocr;
// pub mod pdf_scan;
pub mod audio_asr_iflytek;
pub mod docx;
pub mod markitdown;
pub mod pdf_text;
pub mod pptx;
pub mod text;

/// 根据 MIME 类型获取合适的提取器
pub fn get_extractor_for(mime_type: &str, options: &ExtractOptions) -> Option<Box<dyn Extractor>> {
    if options.markitdown_enabled && markitdown::supports_mime(mime_type) {
        return Some(Box::new(markitdown::MarkItDownExtractor));
    }

    get_fallback_extractor_for(mime_type)
}

/// 获取不依赖 MarkItDown 的内置提取器。
/// audio_asr_iflytek 替换原 audio_asr（macOS SFSpeechRecognizer）处理音频转录。
/// 原 audio_asr 模块保留但不再注册，便于回滚。
pub fn get_fallback_extractor_for(mime_type: &str) -> Option<Box<dyn Extractor>> {
    let extractors: Vec<Box<dyn Extractor>> = vec![
        Box::new(pdf_text::PdfTextExtractor),
        Box::new(docx::DocxExtractor),
        Box::new(pptx::PptxExtractor),
        Box::new(audio_asr_iflytek::IflytekAsrExtractor),
        Box::new(text::TextExtractor),
    ];

    extractors.into_iter().find(|e| e.can_handle(mime_type))
}

// pdf_scan 依赖 macos OCR FFI，暂不激活
// pub fn get_pdf_scan_extractor() -> Box<dyn Extractor> {
//     Box::new(pdf_scan::PdfScanExtractor)
// }
