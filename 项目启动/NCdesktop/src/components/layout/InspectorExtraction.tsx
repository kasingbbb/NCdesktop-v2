import { useEffect, useCallback, useState } from "react";
import { FileText, Copy, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import type { Asset } from "../../types";
import { useExtractionStore } from "../../stores/extractionStore";
import { ExtractionBadge } from "../features/extraction/ExtractionBadge";
import type { ExtractionStatus } from "../../types/extraction";

interface InspectorExtractionProps {
  asset: Asset;
}

function qualityLabel(level: number): string {
  if (level >= 4) return "优秀";
  if (level >= 3) return "良好";
  if (level >= 2) return "可用";
  if (level >= 1) return "较弱";
  return "空";
}

function extractorLabel(name: string): string {
  const map: Record<string, string> = {
    markitdown: "MarkItDown",
    materialized_markdown: "物化 Markdown",
    pdf_text: "内置 PDF 文本提取",
    pdf_scan_ocr: "扫描 PDF OCR",
    docx: "内置 DOCX 提取",
    pptx: "内置 PPTX 提取",
    text: "文本提取",
    vision_ocr: "图片 OCR",
    audio_asr: "音频转写",
  };
  return map[name] ?? name;
}

export function InspectorExtraction({ asset }: InspectorExtractionProps) {
  const { contentCache, statusCache, fetchExtractedContent, retryExtraction } =
    useExtractionStore();

  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetchExtractedContent(asset.id);
  }, [asset.id, fetchExtractedContent]);

  const content = contentCache[asset.id];
  const status = (statusCache[asset.id] ?? content?.status ?? "pending") as ExtractionStatus;

  const handleCopy = useCallback(async () => {
    const text = content?.rawText ?? content?.structuredMd;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard API 不可用 */
    }
  }, [content]);

  const handleRetry = useCallback(() => {
    void retryExtraction(asset.id);
  }, [asset.id, retryExtraction]);

  return (
    <div className="mb-[var(--space-4)]">
      <button
        type="button"
        className="w-full flex items-center gap-1 mb-[var(--space-2)]"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown size={12} style={{ color: "var(--text-tertiary)" }} />
        ) : (
          <ChevronRight size={12} style={{ color: "var(--text-tertiary)" }} />
        )}
        <h3
          className="text-[var(--text-sm)] uppercase tracking-[0.08em] flex items-center gap-1.5"
          style={{ color: "var(--text-tertiary)" }}
        >
          <FileText size={14} className="text-gray-500" />
          提取内容
        </h3>
        <span className="ml-auto">
          <ExtractionBadge status={status} size="md" />
        </span>
      </button>

      {expanded && (
        <div
          className="rounded-[var(--radius-md)] p-[var(--space-3)] border"
          style={{
            background: "var(--surface-secondary)",
            borderColor: "var(--border-primary)",
          }}
        >
          {status === "extracting" && (
            <p
              className="text-[var(--text-xs)] flex items-center gap-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              正在提取内容…
            </p>
          )}

          {status === "pending" && (
            <p
              className="text-[var(--text-xs)]"
              style={{ color: "var(--text-tertiary)" }}
            >
              尚未提取，可在工具栏触发提取。
            </p>
          )}

          {status === "unsupported" && (
            <p
              className="text-[var(--text-xs)]"
              style={{ color: "var(--text-tertiary)" }}
            >
              此素材类型暂不支持内容提取。
            </p>
          )}

          {status === "failed" && (
            <div className="space-y-2">
              <p className="text-[var(--text-xs)]" style={{ color: "#FF3B30" }}>
                {content?.errorMessage ?? "提取失败"}
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[var(--text-xs)] px-2 py-1 rounded-[var(--radius-sm)] border border-app transition-colors hover:bg-[var(--surface-tertiary)]"
                style={{ color: "var(--text-secondary)" }}
                onClick={handleRetry}
              >
                <RefreshCw size={11} />
                重试
              </button>
            </div>
          )}

          {status === "extracted" && content?.structuredMd && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span
                  className="text-[var(--text-xs)] uppercase tracking-[0.05em]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Markdown 预览
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[var(--text-xs)] px-1.5 py-0.5 rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--surface-tertiary)]"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={handleCopy}
                >
                  <Copy size={11} />
                  {copied ? "已复制" : "复制"}
                </button>
              </div>
              <pre
                className="text-[var(--text-xs)] leading-relaxed whitespace-pre-wrap break-words max-h-[240px] overflow-y-auto rounded-[var(--radius-sm)] p-2"
                style={{
                  color: "var(--text-primary)",
                  background: "var(--surface-primary)",
                }}
              >
                {content.structuredMd}
              </pre>
              {content.qualityLevel > 0 && (
                <p
                  className="text-[10px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  质量：{qualityLabel(content.qualityLevel)}（{content.qualityLevel}） · 转换来源：{extractorLabel(content.extractorType)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
