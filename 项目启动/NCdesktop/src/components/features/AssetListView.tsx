import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Image, Music, File, FolderOpen } from "lucide-react";
import { useAssetStore } from "../../stores/assetStore";
import { useProjectStore } from "../../stores/projectStore";
import { useTagStore } from "../../stores/tagStore";
import { useUIStore } from "../../stores/uiStore";
import { useResizable } from "../../hooks/useResizable";
import { useRubberBandSelect } from "../../hooks/useRubberBandSelect";
import { useDragAssets } from "../../hooks/useDragAssets";
import { ResizeHandle } from "../layout/ResizeHandle";
import { WorkspaceFolderStrip } from "./WorkspaceFolderStrip";
import { SelectionOverlay } from "./assets/SelectionOverlay";
import { BatchToolbar } from "./assets/BatchToolbar";
import type { Asset, WorkspaceFolderEntry } from "../../types";
import {
  getProjectWorkspaceRoot,
  listProjectWorkspaceFolders,
  revealProjectWorkspaceFolder,
} from "../../lib/tauri-commands";

/** 后端 JSON 为 assetType，与 types/asset 的 type 对齐 */
function assetKind(a: Asset): string {
  const r = a as Asset & { assetType?: string };
  return r.assetType ?? r.type ?? "other";
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    image: "图像",
    photo: "照片",
    audio_clip: "音频",
    markdown: "Markdown",
    scan_text: "扫描文本",
    pdf: "PDF",
    webpage: "网页",
    other: "其他",
  };
  return map[kind] ?? kind;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatImportTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** AI 整理后的子目录 slug，用于「主题/归类」提示 */
function inferOrganizedCategory(filePath: string): string | null {
  const u = filePath.replace(/\\/g, "/");
  const m = u.match(/\/organized\/([^/]+)\//);
  return m?.[1] ?? null;
}

function originalDisplayName(a: Asset): string {
  return (a.originalName && a.originalName.trim().length > 0 ? a.originalName : a.name).trim();
}

function sourcePathHint(a: Asset): string | undefined {
  const raw = (a as Asset & { sourceData?: string | null }).sourceData;
  if (raw && raw.trim().length > 0) return raw;
  return undefined;
}

function assetIcon(a: Asset, size: number) {
  const t = assetKind(a);
  const color = "var(--text-secondary)";
  if (t === "image" || t === "photo") return <Image size={size} style={{ color }} />;
  if (t === "audio_clip") return <Music size={size} style={{ color }} />;
  if (t === "markdown" || t === "scan_text") return <FileText size={size} style={{ color }} />;
  return <File size={size} style={{ color }} />;
}

/** 按导入时间新→旧（双栏对齐） */
function sortByImportedAtDesc(assets: Asset[]): Asset[] {
  const list = [...assets];
  list.sort(
    (a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()
  );
  return list;
}

/** 判断素材文件是否落在当前工作区子目录（与 Rust 侧路径一致，正斜杠规范化） */
function assetMatchesWorkspaceFolder(
  filePath: string,
  workspaceRoot: string,
  relativePath: string
): boolean {
  const fp = filePath.replace(/\\/g, "/");
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
  if (!root) {
    return true;
  }
  if (relativePath === "__ROOT__") {
    const last = fp.lastIndexOf("/");
    const parent = last <= 0 ? fp : fp.slice(0, last);
    return parent === root;
  }
  const prefix = `${root}/${relativePath.replace(/^\/+/, "")}`;
  return fp === prefix || fp.startsWith(`${prefix}/`);
}

export function AssetListView() {
  const {
    assets,
    assetTagNamesById,
    isLoading,
    error,
    selectAsset,
    selectedAssetId,
    selectedAssetIds,
    setSelectedAssetIds,
    toggleSelectAsset,
    clearSelection,
    viewMode,
  } = useAssetStore();
  const setViewerAssetId = useUIStore((s) => s.setViewerAssetId);

  // 右栏：框选容器 ref
  const rightPaneRef = useRef<HTMLDivElement>(null);
  // 卡片 ref map：id → DOM 元素
  const cardRefsRef = useRef<Map<string, HTMLElement>>(new Map());

  const getItemRects = useCallback(() => {
    const result: Array<{ id: string; rect: DOMRect }> = [];
    cardRefsRef.current.forEach((el, id) => {
      result.push({ id, rect: el.getBoundingClientRect() });
    });
    return result;
  }, []);

  const { selectionRect } = useRubberBandSelect({
    containerRef: rightPaneRef,
    getItemRects,
    onSelectionChange: setSelectedAssetIds,
  });

  const { makeDragProps } = useDragAssets(selectedAssetIds);

  // Cmd+A 全选；Esc 清空选择
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;
      if (e.key === "Escape") clearSelection();
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        useAssetStore.getState().selectAllAssets();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [clearSelection]);
  const activeProject = useProjectStore((s) => s.getActiveProject());
  const assetTagFilterId = useUIStore((s) => s.assetTagFilterId);
  const setAssetTagFilterId = useUIStore((s) => s.setAssetTagFilterId);
  const workspaceFolderRelativePath = useUIStore((s) => s.workspaceFolderRelativePath);
  const setWorkspaceFolderRelativePath = useUIStore(
    (s) => s.setWorkspaceFolderRelativePath
  );
  const tags = useTagStore((s) => s.tags);
  const fetchTags = useTagStore((s) => s.fetchTags);
  const filterTagName = assetTagFilterId
    ? tags.find((t) => t.id === assetTagFilterId)?.name ?? null
    : null;

  const orderedAssets = useMemo(() => sortByImportedAtDesc(assets), [assets]);

  const [workspaceRoot, setWorkspaceRoot] = useState<string>("");
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolderEntry[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  const loadWorkspaceFolders = useCallback(async () => {
    const pid = activeProject?.id;
    if (!pid) {
      setWorkspaceRoot("");
      setWorkspaceFolders([]);
      return;
    }
    setFoldersLoading(true);
    try {
      const [root, list] = await Promise.all([
        getProjectWorkspaceRoot(pid),
        listProjectWorkspaceFolders(pid),
      ]);
      setWorkspaceRoot(root);
      setWorkspaceFolders(list);
    } catch {
      setWorkspaceFolders([]);
    } finally {
      setFoldersLoading(false);
    }
  }, [activeProject?.id]);

  useEffect(() => {
    void loadWorkspaceFolders();
  }, [loadWorkspaceFolders, assets.length]);

  const displayAssets = useMemo(() => {
    if (!workspaceFolderRelativePath || !workspaceRoot) {
      return orderedAssets;
    }
    return orderedAssets.filter((a) =>
      assetMatchesWorkspaceFolder(
        a.filePath,
        workspaceRoot,
        workspaceFolderRelativePath
      )
    );
  }, [orderedAssets, workspaceRoot, workspaceFolderRelativePath]);

  const folderFilterLabel = workspaceFolderRelativePath
    ? workspaceFolders.find((f) => f.relativePath === workspaceFolderRelativePath)
        ?.displayLabel ?? workspaceFolderRelativePath
    : null;

  const leftPane = useResizable({
    initialWidth: 360,
    minWidth: 260,
    maxWidth: 560,
    direction: "right",
  });

  useEffect(() => {
    if (assetTagFilterId) {
      void fetchTags();
    }
  }, [assetTagFilterId, fetchTags]);

  // Space: quick-look 已选素材；Enter: 全屏阅读器
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;
      if ((e.key === " " || e.key === "Enter") && selectedAssetId) {
        e.preventDefault();
        setViewerAssetId(selectedAssetId);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedAssetId, setViewerAssetId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-[var(--space-6)]">
        <p className="text-[var(--text-sm)]" style={{ color: "var(--text-tertiary)" }}>
          加载素材中…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-[var(--space-6)]">
        <p className="text-[var(--text-sm)]" style={{ color: "#FF3B30" }}>
          {error}
        </p>
      </div>
    );
  }

  const filterBanner =
    filterTagName ? (
      <div
        className="mb-[var(--space-3)] flex items-center justify-between gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-[var(--radius-lg)] text-[var(--text-xs)] shrink-0 border border-app bg-[var(--surface-tertiary)]"
      >
        <span style={{ color: "var(--text-secondary)" }}>
          按标签筛选：<strong className="font-semibold" style={{ color: "var(--text-primary)" }}>{filterTagName}</strong>（{assets.length} 个素材）
        </span>
        <button
          type="button"
          className="shrink-0 px-2 py-1 rounded-[var(--radius-sm)]"
          style={{ color: "var(--text-tertiary)" }}
          onClick={() => setAssetTagFilterId(null)}
        >
          清除
        </button>
      </div>
    ) : null;

  const folderFilterBanner =
    folderFilterLabel && workspaceFolderRelativePath ? (
      <div
        className="mb-[var(--space-3)] flex items-center justify-between gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-[var(--radius-md)] text-[var(--text-xs)] shrink-0"
        style={{ background: "rgba(31,69,110,0.06)", border: "1px solid var(--border-primary)" }}
      >
        <span style={{ color: "var(--text-secondary)" }}>
          文件夹：<strong className="font-semibold" style={{ color: "var(--text-primary)" }}>{folderFilterLabel}</strong>（
          {displayAssets.length} 个素材）
        </span>
        <button
          type="button"
          className="shrink-0 px-2 py-1 rounded-[var(--radius-sm)]"
          style={{ color: "var(--text-tertiary)" }}
          onClick={() => setWorkspaceFolderRelativePath(null)}
        >
          清除
        </button>
      </div>
    ) : null;

  const emptyCopy = (
    <div className="flex-1 flex flex-col items-center justify-center gap-[var(--space-2)] p-[var(--space-6)] min-h-[200px]">
      <p className="text-[var(--text-base)] font-medium" style={{ color: "var(--text-secondary)" }}>
        {assets.length === 0
          ? "该项目暂无素材"
          : workspaceFolderRelativePath
            ? "当前文件夹筛选下暂无素材"
            : "暂无素材"}
      </p>
      <p className="text-[var(--text-sm)] text-center max-w-md" style={{ color: "var(--text-tertiary)" }}>
        拖入文件会<strong style={{ color: "var(--text-secondary)" }}>复制</strong>到「下载」文件夹下的{" "}
        <code className="text-[11px]">NoteCaptWorkPlace</code> 中本项目目录，原件不会被修改。当前项目：「
        {activeProject?.name ?? "…"}」。
      </p>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-[var(--space-4)]">
      {filterBanner}
      {folderFilterBanner}
      <BatchToolbar selectedIds={selectedAssetIds} />

      <WorkspaceFolderStrip
        folders={workspaceFolders}
        workspaceRootHint={workspaceRoot}
        selectedRelativePath={workspaceFolderRelativePath}
        loading={foldersLoading}
        onSelect={(path) => setWorkspaceFolderRelativePath(path)}
        onReveal={(relativePath) => {
          const pid = activeProject?.id;
          if (!pid) {
            return;
          }
          void revealProjectWorkspaceFolder(pid, relativePath).catch(() => {
            /* 非 Tauri 环境或路径不存在 */
          });
        }}
        onRefresh={() => void loadWorkspaceFolders()}
      />

      {displayAssets.length === 0 ? (
        emptyCopy
      ) : (
      <div
        className="flex flex-1 min-h-0 gap-0 overflow-hidden rounded-[var(--radius-xl)] border border-app bg-[var(--surface-primary)]"
        style={{ boxShadow: "var(--shadow-float)" }}
      >
        {/* 左：导入原件 */}
        <div
          className="flex flex-col min-h-0 min-w-0 border-r shrink-0"
          style={{ width: leftPane.width, borderColor: "var(--border-primary)" }}
        >
          <div className="px-3 py-2 border-b shrink-0 border-app bg-[var(--surface-tertiary)]">
            <p className="text-[var(--text-sm)] font-semibold" style={{ color: "var(--text-primary)" }}>
              导入原件
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              拖入时的文件名 · 按导入时间新→旧 · 与访达原件一致
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--surface-primary)]">
            {viewMode === "list" ? (
              <ul className="flex flex-col gap-2 p-2">
                {displayAssets.map((a) => {
                  const active = selectedAssetId === a.id;
                  const hint = sourcePathHint(a);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => selectAsset(a.id)}
                        onDoubleClick={() => setViewerAssetId(a.id)}
                        className="w-full text-left px-3 py-2.5 flex items-start gap-2 rounded-[var(--radius-md)] border border-app transition-colors hover:border-[var(--border-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--border-active)] bg-[var(--surface-primary)]"
                        style={{
                          background: active ? "var(--sidebar-active-bg)" : undefined,
                        }}
                        title={hint ? `原件路径：${hint}` : originalDisplayName(a)}
                      >
                        <span className="shrink-0 mt-0.5">{assetIcon(a, 18)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="text-[var(--text-sm)] font-medium line-clamp-2 block" style={{ color: "var(--text-primary)" }}>
                            {originalDisplayName(a)}
                          </span>
                          <span className="text-[10px] font-mono tabular-nums mt-0.5 block" style={{ color: "var(--text-secondary)" }}>
                            导入 {formatImportTime(a.importedAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-2 grid grid-cols-2 gap-2">
                {displayAssets.map((a) => {
                  const active = selectedAssetId === a.id;
                  const hint = sourcePathHint(a);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => selectAsset(a.id)}
                      onDoubleClick={() => setViewerAssetId(a.id)}
                      className="flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] border border-app p-2 transition-colors hover:border-[var(--border-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-active)] bg-[var(--surface-primary)]"
                      style={{
                        background: active ? "var(--sidebar-active-bg)" : undefined,
                      }}
                      title={hint ? `原件：${hint}` : undefined}
                    >
                      <div className="w-14 h-14 rounded-[var(--radius-md)] flex items-center justify-center shrink-0 bg-[var(--surface-tertiary)]">
                        {assetIcon(a, 22)}
                      </div>
                      <p className="w-full text-[11px] font-medium line-clamp-2 text-center leading-snug" style={{ color: "var(--text-primary)" }}>
                        {originalDisplayName(a)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <ResizeHandle onMouseDown={leftPane.handleMouseDown} isResizing={leftPane.isResizing} />

        {/* 右：工作区（重命名 + 标签 + 归类目录） */}
        <div ref={rightPaneRef} className="flex-1 min-w-0 flex flex-col min-h-0 relative">
          <div className="px-3 py-2 border-b shrink-0 border-app bg-[var(--surface-tertiary)]">
            <p className="text-[var(--text-sm)] font-semibold" style={{ color: "var(--text-primary)" }}>
              工作区
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              应用目录内副本的展示名、AI 标签与整理子目录（点击与左侧同一素材联动）
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--surface-primary)] relative">
            <SelectionOverlay rect={selectionRect} />
            {viewMode === "list" ? (
              <ul className="flex flex-col gap-2 p-2">
                {displayAssets.map((a) => {
                  const active = selectedAssetId === a.id;
                  const multiSelected = selectedAssetIds.has(a.id);
                  const tagNames = assetTagNamesById[a.id] ?? [];
                  const cat = inferOrganizedCategory(a.filePath);
                  const renamed = a.name.trim() !== originalDisplayName(a).trim();
                  return (
                    <li key={a.id} ref={(el) => { if (el) cardRefsRef.current.set(a.id, el); else cardRefsRef.current.delete(a.id); }}>
                      <button
                        type="button"
                        {...makeDragProps(a.id)}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey) {
                            toggleSelectAsset(a.id);
                          } else {
                            selectAsset(a.id);
                          }
                        }}
                        className="w-full text-left px-3 py-2.5 flex items-start gap-2 rounded-[var(--radius-md)] border border-app transition-colors hover:border-[var(--border-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--border-active)] bg-[var(--surface-primary)]"
                        style={{
                          background: multiSelected
                            ? "rgba(31,69,110,0.08)"
                            : active
                            ? "var(--sidebar-active-bg)"
                            : undefined,
                          outline: multiSelected ? "2px solid var(--brand-navy)" : undefined,
                          outlineOffset: "-2px",
                        }}
                      >
                        <span className="shrink-0 mt-0.5">{assetIcon(a, 18)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="text-[var(--text-sm)] font-medium line-clamp-2 block" style={{ color: "var(--text-primary)" }}>
                            {a.name}
                            {renamed ? (
                              <span className="ml-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded-[var(--radius-md)] bg-[var(--surface-tertiary)]" style={{ color: "var(--text-secondary)" }}>
                                已重命名
                              </span>
                            ) : null}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5 mt-1">
                            {cat ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-[var(--radius-full)] bg-[var(--color-accent-soft)] border border-app" style={{ color: "var(--text-secondary)" }}>
                                <FolderOpen size={10} />
                                {cat}
                              </span>
                            ) : null}
                            {tagNames.map((tn) => (
                              <span
                                key={tn}
                                className="tag-pill !text-[10px] !px-1.5 !py-0.5"
                              >
                                {tn}
                              </span>
                            ))}
                          </span>
                          <span className="text-[10px] font-mono tabular-nums mt-1 block truncate" style={{ color: "var(--text-secondary)" }} title={a.filePath}>
                            {kindLabel(assetKind(a))} · {formatBytes(a.fileSize)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {displayAssets.map((a) => {
                  const active = selectedAssetId === a.id;
                  const multiSelected = selectedAssetIds.has(a.id);
                  const tagNames = assetTagNamesById[a.id] ?? [];
                  const cat = inferOrganizedCategory(a.filePath);
                  const renamed = a.name.trim() !== originalDisplayName(a).trim();
                  return (
                    <button
                      key={a.id}
                      ref={(el) => { if (el) cardRefsRef.current.set(a.id, el); else cardRefsRef.current.delete(a.id); }}
                      type="button"
                      {...makeDragProps(a.id)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey) {
                          toggleSelectAsset(a.id);
                        } else {
                          selectAsset(a.id);
                        }
                      }}
                      onDoubleClick={() => setViewerAssetId(a.id)}
                      className="flex flex-col items-center gap-1 rounded-[var(--radius-md)] border border-app p-2 transition-colors hover:border-[var(--border-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-active)] bg-[var(--surface-primary)]"
                      style={{
                        background: multiSelected
                          ? "rgba(31,69,110,0.08)"
                          : active
                          ? "var(--sidebar-active-bg)"
                          : undefined,
                        outline: multiSelected ? "2px solid var(--brand-navy)" : undefined,
                        outlineOffset: "-2px",
                      }}
                    >
                      <div className="w-14 h-14 rounded-[var(--radius-md)] flex items-center justify-center shrink-0 bg-[var(--surface-tertiary)]">
                        {assetIcon(a, 22)}
                      </div>
                      <p className="w-full text-[11px] font-medium line-clamp-2 text-center leading-snug" style={{ color: "var(--text-primary)" }}>
                        {a.name}
                      </p>
                      {renamed ? (
                        <span className="text-[9px]" style={{ color: "var(--text-secondary)" }}>
                          已重命名
                        </span>
                      ) : null}
                      {cat ? (
                        <span className="text-[9px] line-clamp-1 w-full text-center" style={{ color: "var(--text-tertiary)" }}>
                          {cat}
                        </span>
                      ) : null}
                      {tagNames.length > 0 ? (
                        <span className="text-[9px] line-clamp-1 w-full text-center" style={{ color: "var(--text-tertiary)" }}>
                          {tagNames.slice(0, 2).join(" · ")}
                          {tagNames.length > 2 ? "…" : ""}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
