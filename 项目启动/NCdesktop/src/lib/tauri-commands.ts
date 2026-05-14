/**
 * Tauri IPC 命令封装层
 * 所有前端到 Rust 后端的调用统一在此文件管理
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  Library,
  Project,
  Asset,
  Timeline,
  AudioTrack,
  Keyframe,
  Marker,
  Tag,
  Note,
  SearchResult,
  WorkspaceFolderEntry,
} from "../types";
import type { AIAnalysis } from "../types/asset";

// ── Library ────────────────────────────────────────

export async function getLibraries(): Promise<Library[]> {
  return invoke<Library[]>("get_libraries");
}

export async function createLibrary(name: string, rootPath: string): Promise<Library> {
  return invoke<Library>("create_library", { name, rootPath });
}

export async function updateLibrary(library: Library): Promise<void> {
  return invoke<void>("update_library", { library });
}

export async function deleteLibrary(id: string): Promise<void> {
  return invoke<void>("delete_library", { id });
}

// ── Project ────────────────────────────────────────

export async function getProjects(libraryId: string): Promise<Project[]> {
  return invoke<Project[]>("get_projects", { libraryId });
}

export async function getProject(id: string): Promise<Project | null> {
  return invoke<Project | null>("get_project", { id });
}

export async function createProject(libraryId: string, name: string): Promise<Project> {
  return invoke<Project>("create_project", { libraryId, name });
}

export async function updateProject(project: Project): Promise<void> {
  return invoke<void>("update_project", { project });
}

export async function deleteProject(id: string): Promise<void> {
  return invoke<void>("delete_project", { id });
}

// ── 工作区文件夹（NoteCaptWorkPlace/<projectId>）────────────────

export async function getProjectWorkspaceRoot(projectId: string): Promise<string> {
  return invoke<string>("get_project_workspace_root", { projectId });
}

export async function listProjectWorkspaceFolders(
  projectId: string
): Promise<WorkspaceFolderEntry[]> {
  return invoke<WorkspaceFolderEntry[]>("list_project_workspace_folders", { projectId });
}

export async function revealProjectWorkspaceFolder(
  projectId: string,
  relativePath: string
): Promise<void> {
  return invoke<void>("reveal_project_workspace_folder", { projectId, relativePath });
}

// ── Asset ──────────────────────────────────────────

export async function getAssets(projectId: string): Promise<Asset[]> {
  return invoke<Asset[]>("get_assets", { projectId });
}

/** 项目内 assetId → 标签名（用于工作区视图） */
export async function getProjectAssetTagMap(
  projectId: string
): Promise<Record<string, string[]>> {
  return invoke<Record<string, string[]>>("get_project_asset_tag_map", { projectId });
}

export async function getAssetsByTag(projectId: string, tagId: string): Promise<Asset[]> {
  return invoke<Asset[]>("get_assets_by_tag", { projectId, tagId });
}

export async function getAsset(id: string): Promise<Asset | null> {
  return invoke<Asset | null>("get_asset", { id });
}

export async function createAsset(params: {
  projectId: string;
  assetType: string;
  name: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}): Promise<Asset> {
  return invoke<Asset>("create_asset", params);
}

export async function updateAsset(asset: Asset): Promise<void> {
  return invoke<void>("update_asset", { asset });
}

export async function deleteAsset(id: string): Promise<void> {
  return invoke<void>("delete_asset", { id });
}

export async function toggleAssetStar(id: string): Promise<boolean> {
  return invoke<boolean>("toggle_asset_star", { id });
}

export async function getAssetAnalysis(assetId: string): Promise<AIAnalysis | null> {
  return invoke<AIAnalysis | null>("get_asset_analysis", { assetId });
}

export async function moveAssetToWorkspaceFolder(
  assetIds: string[],
  targetRelativePath: string,
  projectId: string
): Promise<void> {
  return invoke<void>("move_asset_to_workspace_folder", {
    assetIds,
    targetRelativePath,
    projectId,
  });
}

/** 跨项目移动素材（BatchToolbar"移动到"路径）。返回更新后的素材行。 */
export async function moveAssets(
  assetIds: string[],
  targetProjectId: string
): Promise<Asset[]> {
  return invoke<Asset[]>("move_assets", { assetIds, targetProjectId });
}

/** 跨项目复制素材（BatchToolbar"复制到"路径）。返回新插入的素材行。 */
export async function copyAssets(
  assetIds: string[],
  targetProjectId: string
): Promise<Asset[]> {
  return invoke<Asset[]>("copy_assets", { assetIds, targetProjectId });
}

// ── MarkItDown 转换 ────────────────────────────────

export interface MarkitdownStatus {
  available: boolean;
  version: string | null;
  pythonCmd: string | null;
  reason: string | null;
  installHint: string | null;
}

export async function checkMarkitdownStatus(): Promise<MarkitdownStatus> {
  return invoke<MarkitdownStatus>("check_markitdown_status");
}

export interface ConversionResult {
  extractorType: string;
  markdown: string;
  qualityLevel: number;
  segmentCount: number;
}

export async function convertAssetToMarkdown(assetId: string): Promise<ConversionResult> {
  return invoke<ConversionResult>("convert_asset_to_markdown", { assetId });
}

// ── Timeline ───────────────────────────────────────

export async function getTimeline(projectId: string): Promise<Timeline | null> {
  return invoke<Timeline | null>("get_timeline", { projectId });
}

export async function createTimeline(params: {
  projectId: string;
  startTime: string;
  endTime: string;
  duration: number;
}): Promise<Timeline> {
  return invoke<Timeline>("create_timeline", params);
}

// ── AudioTrack ─────────────────────────────────────

export async function getAudioTracks(timelineId: string): Promise<AudioTrack[]> {
  return invoke<AudioTrack[]>("get_audio_tracks", { timelineId });
}

export async function createAudioTrack(params: {
  timelineId: string;
  filePath: string;
  fileName: string;
  format: string;
  duration: number;
  sampleRate: number;
  channels: number;
}): Promise<AudioTrack> {
  return invoke<AudioTrack>("create_audio_track", params);
}

// ── Keyframe ───────────────────────────────────────

export async function getKeyframes(timelineId: string): Promise<Keyframe[]> {
  return invoke<Keyframe[]>("get_keyframes", { timelineId });
}

export async function createKeyframe(params: {
  timelineId: string;
  assetId: string;
  anchorTime: number;
  source: string;
}): Promise<Keyframe> {
  return invoke<Keyframe>("create_keyframe", params);
}

export async function deleteKeyframe(id: string): Promise<void> {
  return invoke<void>("delete_keyframe", { id });
}

// ── Marker ─────────────────────────────────────────

export async function getMarkers(timelineId: string): Promise<Marker[]> {
  return invoke<Marker[]>("get_markers", { timelineId });
}

export async function createMarker(params: {
  timelineId: string;
  time: number;
  label: string;
  color: string;
  markerType: string;
}): Promise<Marker> {
  return invoke<Marker>("create_marker", params);
}

export async function deleteMarker(id: string): Promise<void> {
  return invoke<void>("delete_marker", { id });
}

// ── Tag ────────────────────────────────────────────

export async function getTags(): Promise<Tag[]> {
  return invoke<Tag[]>("get_tags");
}

export async function createTag(name: string, color: string, source: string): Promise<Tag> {
  return invoke<Tag>("create_tag", { name, color, source });
}

export async function deleteTag(id: string): Promise<void> {
  return invoke<void>("delete_tag", { id });
}

export async function linkTagToAsset(assetId: string, tagId: string): Promise<void> {
  return invoke<void>("link_tag_to_asset", { assetId, tagId });
}

export async function unlinkTagFromAsset(assetId: string, tagId: string): Promise<void> {
  return invoke<void>("unlink_tag_from_asset", { assetId, tagId });
}

/** 按名称查找或创建标签并关联到素材 */
export async function ensureAssetTagByName(assetId: string, name: string): Promise<Tag> {
  return invoke<Tag>("ensure_asset_tag_by_name", { assetId, name });
}

export async function getAssetTags(assetId: string): Promise<Tag[]> {
  return invoke<Tag[]>("get_asset_tags", { assetId });
}

/** 从 AI 分析行解析建议标签（后端 `suggestedTags` 为 JSON 字符串） */
export async function getAssetSuggestedTagNames(assetId: string): Promise<string[]> {
  const row = await invoke<{ suggestedTags?: string } | null>("get_asset_analysis", { assetId });
  if (!row?.suggestedTags?.trim()) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(row.suggestedTags);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((x) => String(x).trim()).filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

// ── Note ───────────────────────────────────────────

export async function getNotes(projectId: string): Promise<Note[]> {
  return invoke<Note[]>("get_notes", { projectId });
}

export async function getNote(id: string): Promise<Note | null> {
  return invoke<Note | null>("get_note", { id });
}

export async function createNote(params: {
  projectId: string;
  content: string;
  assetId?: string;
  timelineTime?: number;
}): Promise<Note> {
  return invoke<Note>("create_note", params);
}

export async function updateNote(id: string, content: string): Promise<void> {
  return invoke<void>("update_note", { id, content });
}

export async function deleteNote(id: string): Promise<void> {
  return invoke<void>("delete_note", { id });
}

// ── Search ─────────────────────────────────────────

export async function searchAll(query: string, limit?: number): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search", { query, limit });
}

// ── Settings ───────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  return invoke<string | null>("get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke<void>("set_setting", { key, value });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("get_all_settings");
}

// ── 悬浮窗拖入导入 ─────────────────────────────────

/** 与后端 `ImportDropCreated` 一致：`Asset` 字段扁平 + AI 状态 */
export type ImportDropCreated = Asset & {
  aiClassified: boolean;
  aiNote: string | null;
  /** 为 true 时 LLM 在后台运行，界面可先显示「分析中」 */
  aiPending?: boolean;
};

export interface ImportDropSummary {
  created: ImportDropCreated[];
  failures: string[];
  importProjectName: string;
}

export async function importDropPaths(paths: string[]): Promise<ImportDropSummary> {
  return invoke<ImportDropSummary>("import_drop_paths", { paths });
}

export async function closeDropzoneWindow(): Promise<void> {
  return invoke<void>("close_dropzone_window");
}

// ── Sync ───────────────────────────────────────────

export interface DetectedCard {
  mountPath: string;
  arcaPath: string;
  deviceId: string;
  deviceName: string;
}

export interface ImportPreview {
  deviceName: string;
  deviceId: string;
  sessions: Array<{
    sessionId: string;
    title: string;
    startTime: string;
    endTime: string;
    audioDuration: number;
    photoCount: number;
    scanCount: number;
    isSynced: boolean;
  }>;
  newSessions: string[];
}

export async function scanTFCard(): Promise<{ cards: DetectedCard[] }> {
  return invoke<{ cards: DetectedCard[] }>("scan_tf_card");
}

export async function previewImport(arcaPath: string): Promise<ImportPreview> {
  return invoke<ImportPreview>("preview_import", { arcaPath });
}

export async function importSessions(params: {
  arcaPath: string;
  sessionIds: string[];
  libraryId: string;
}): Promise<string[]> {
  return invoke<string[]>("import_sessions", params);
}

export async function getSyncStatus(arcaPath: string): Promise<Array<{
  sessionId: string;
  deviceId: string;
  syncedAt: string;
  projectId: string;
}>> {
  return invoke("get_sync_status", { arcaPath });
}

// ── Audio ──────────────────────────────────────────

export interface AudioMetadataResult {
  duration: number;
  sampleRate: number;
  channels: number;
  format: string;
  fileSize: number;
}

export interface WaveformDataResult {
  sampleRate: number;
  duration: number;
  peaksPerSecond: number;
  peaks: Array<{ min: number; max: number }>;
}

export async function getAudioMetadata(filePath: string): Promise<AudioMetadataResult> {
  return invoke<AudioMetadataResult>("get_audio_metadata", { filePath });
}

export async function getWaveformData(filePath: string): Promise<WaveformDataResult> {
  return invoke<WaveformDataResult>("get_waveform_data", { filePath });
}

// ── Export ──────────────────────────────────────────

export interface ExportOptions {
  project_id: string;
  include_transcription: boolean;
  include_ocr: boolean;
  include_ai_summary: boolean;
  include_tags: boolean;
  include_notes: boolean;
  include_timeline: boolean;
}

export interface ExportResult {
  markdown: string;
  word_count: number;
  section_count: number;
}

export async function exportProjectMarkdown(options: ExportOptions): Promise<ExportResult> {
  return invoke<ExportResult>("export_project_markdown", { options });
}

export async function copyToClipboard(text: string): Promise<void> {
  return invoke("copy_to_clipboard", { text });
}

// ── LLM ──────────────────────────────────────────

export interface LLMConfig {
  api_key_masked: string;
  base_url: string;
  model: string;
  is_configured: boolean;
}

export interface LLMSummaryResult {
  summary: string;
  model: string;
  token_count: number;
}

export interface ClassifyResult {
  category: string;
  tags: string[];
  confidence: number;
  language: string;
  /** 建议主文件名（不含扩展名），导入分类后用于整理 */
  suggestedFileName?: string;
}

export async function getLLMConfig(): Promise<LLMConfig> {
  return invoke<LLMConfig>("get_llm_config");
}

/** 保存 LLM 到本地数据库；`apiKeyAction`：`keep` 不改 Key，`set` 用 `apiKeyValue`，`clear` 清除应用内 Key */
export interface SaveLlmConfigPayload {
  baseUrl: string;
  model: string;
  apiKeyAction: "keep" | "clear" | "set";
  apiKeyValue?: string;
}

export async function saveLLMConfig(payload: SaveLlmConfigPayload): Promise<void> {
  return invoke("save_llm_config", {
    payload: {
      baseUrl: payload.baseUrl,
      model: payload.model,
      apiKeyAction: payload.apiKeyAction,
      apiKeyValue: payload.apiKeyValue ?? "",
    },
  });
}

export async function llmSummarize(content: string, language: string): Promise<LLMSummaryResult> {
  return invoke<LLMSummaryResult>("llm_summarize", { content, language });
}

export async function llmClassify(content: string): Promise<ClassifyResult> {
  return invoke<ClassifyResult>("llm_classify", { content });
}

/** 固定样本调用分类 API，用于设置页验证连通性与 JSON 解析 */
export async function llmProbe(): Promise<ClassifyResult> {
  return invoke<ClassifyResult>("llm_probe");
}

export async function llmEnhanceExport(markdown: string): Promise<string> {
  return invoke<string>("llm_enhance_export", { markdown });
}
