import type { Tag } from "./common";

/** 素材 — 所有类型的知识碎片 */
export interface Asset {
  id: string;
  projectId: string;
  type: AssetType;
  /** 工作区内展示名（可被 AI 重命名） */
  name: string;
  /** 拖入时的原始文件名；副本在应用目录内整理，原件路径不会被改写 */
  originalName?: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  tags: Tag[];
  capturedAt: string;
  importedAt: string;
  /** 后端 `sourceData`：如悬浮窗拖入时为原件绝对路径 */
  sourceData?: string | null;
  source: AssetSource;
  aiAnalysis: AIAnalysis | null;
  isStarred: boolean;
}

export type AssetType =
  | "photo"
  | "scan_text"
  | "audio_clip"
  | "pdf"
  | "webpage"
  | "markdown"
  | "image"
  | "other";

export type AssetSource =
  | { type: "tf_card_camera" }
  | { type: "tf_card_scanner" }
  | { type: "tf_card_mic" }
  | { type: "dropzone_drag" }
  | { type: "dropzone_paste" }
  | { type: "manual_import" };

/** AI 分析结果 */
export interface AIAnalysis {
  summary: string;
  topics: string[];
  ocrText: string | null;
  language: string;
  suggestedTags: string[];
  suggestedName: string;
}
