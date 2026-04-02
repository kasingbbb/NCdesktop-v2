import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, FolderOpen } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { SidebarSection } from "../layout/SidebarItem";
import { useProjectStore } from "../../stores/projectStore";
import { useUIStore } from "../../stores/uiStore";
import { useAssetStore } from "../../stores/assetStore";
import {
  listProjectWorkspaceFolders,
  revealProjectWorkspaceFolder,
} from "../../lib/tauri-commands";
import type { WorkspaceFolderEntry } from "../../types";
import { workspaceFolderKindBadge } from "../../lib/workspace-folder-badges";
import { DRAG_ASSET_TYPE, type DragAssetPayload } from "../../hooks/useDragAssets";

export function ProjectTree() {
  const { projects, activeProjectId, setActiveProject } = useProjectStore();
  const workspaceFolderRelativePath = useUIStore((s) => s.workspaceFolderRelativePath);
  const setWorkspaceFolderRelativePath = useUIStore(
    (s) => s.setWorkspaceFolderRelativePath
  );
  const setSidebarSection = useUIStore((s) => s.setSidebarSection);

  const { moveAssets, copyAssets } = useAssetStore();
  const addNotification = useUIStore((s) => s.addNotification);

  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [foldersByProject, setFoldersByProject] = useState<
    Record<string, WorkspaceFolderEntry[]>
  >({});
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [folderRefreshTick, setFolderRefreshTick] = useState(0);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);

  const loadFolders = useCallback(async (projectId: string) => {
    setLoadingProjectId(projectId);
    try {
      const list = await listProjectWorkspaceFolders(projectId);
      setFoldersByProject((prev) => ({ ...prev, [projectId]: list }));
    } catch {
      setFoldersByProject((prev) => ({ ...prev, [projectId]: [] }));
    } finally {
      setLoadingProjectId((cur) => (cur === projectId ? null : cur));
    }
  }, []);

  const toggleExpand = useCallback(
    (projectId: string) => {
      setExpandedIds((prev) => {
        if (prev.includes(projectId)) {
          return prev.filter((id) => id !== projectId);
        }
        return [...prev, projectId];
      });
    },
    []
  );

  useEffect(() => {
    expandedIds.forEach((id) => {
      void loadFolders(id);
    });
  }, [expandedIds, folderRefreshTick, loadFolders]);

  useEffect(() => {
    let cancelled = false;
    let unlistenImport: (() => void) | undefined;
    let unlistenAi: (() => void) | undefined;

    void listen("notecapt/import-drop-finished", () => {
      if (!cancelled) setFolderRefreshTick((t) => t + 1);
    }).then((fn) => {
      if (!cancelled) unlistenImport = fn;
    });

    void listen<{ projectId: string }>("notecapt/dropzone-ai-finished", () => {
      if (!cancelled) setFolderRefreshTick((t) => t + 1);
    }).then((fn) => {
      if (!cancelled) unlistenAi = fn;
    });

    return () => {
      cancelled = true;
      unlistenImport?.();
      unlistenAi?.();
    };
  }, []);

  const openProject = useCallback(
    (projectId: string, folderPath: string | null) => {
      setActiveProject(projectId);
      setWorkspaceFolderRelativePath(folderPath);
      setSidebarSection("projects");
    },
    [setActiveProject, setWorkspaceFolderRelativePath, setSidebarSection]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, projectId: string) => {
      if (!e.dataTransfer.types.includes(DRAG_ASSET_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
      setDragOverProjectId(projectId);
    },
    []
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      // Only clear if leaving the project button itself (not a child)
      if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
      setDragOverProjectId(null);
    },
    []
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetProjectId: string) => {
      e.preventDefault();
      setDragOverProjectId(null);
      const raw = e.dataTransfer.getData(DRAG_ASSET_TYPE);
      if (!raw) return;
      let payload: DragAssetPayload;
      try {
        payload = JSON.parse(raw) as DragAssetPayload;
      } catch {
        return;
      }
      const { assetIds } = payload;
      if (!assetIds.length) return;
      const isCopy = e.altKey;
      try {
        if (isCopy) {
          await copyAssets(assetIds, targetProjectId);
          addNotification({
            type: "success",
            title: "复制成功",
            message: `已将 ${assetIds.length} 个素材复制到目标项目`,
            duration: 2500,
          });
        } else {
          await moveAssets(assetIds, targetProjectId);
          addNotification({
            type: "success",
            title: "移动成功",
            message: `已将 ${assetIds.length} 个素材移动到目标项目`,
            duration: 2500,
          });
        }
      } catch (err) {
        addNotification({
          type: "error",
          title: isCopy ? "复制失败" : "移动失败",
          message: String(err),
          duration: 4000,
        });
      }
    },
    [moveAssets, copyAssets, addNotification]
  );

  return (
    <SidebarSection title="Projects">
      {projects.length === 0 ? (
        <div className="px-5 py-2 text-[var(--text-xs)]" style={{ color: "var(--text-tertiary)" }}>
          暂无项目
        </div>
      ) : (
        projects.map((project) => {
          const expanded = expandedIds.includes(project.id);
          const folders = foldersByProject[project.id] ?? [];
          const isLoading = loadingProjectId === project.id;
          const projectHighlighted = activeProjectId === project.id;

          return (
            <div key={project.id} className="mb-1">
              <div className="flex items-stretch gap-0.5 pr-1">
                <button
                  type="button"
                  className="shrink-0 w-6 flex items-center justify-center rounded-[var(--radius-sm)]"
                  style={{ color: "var(--text-tertiary)" }}
                  aria-expanded={expanded}
                  title={expanded ? "收起子文件夹" : "展开工作区子文件夹"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(project.id);
                  }}
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <button
                  type="button"
                  className={`sidebar-item flex-1 min-w-0 flex items-center mb-0 ${
                    projectHighlighted ? "active" : ""
                  }`}
                  style={
                    dragOverProjectId === project.id
                      ? { background: "rgba(31,69,110,0.12)", outline: "2px solid var(--brand-navy)", outlineOffset: "-2px" }
                      : undefined
                  }
                  onClick={() => openProject(project.id, null)}
                  onDragOver={(e) => handleDragOver(e, project.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => void handleDrop(e, project.id)}
                >
                  <span className="sidebar-item-icon mr-2 shrink-0">
                    <FolderOpen size={16} />
                  </span>
                  <span className="flex-1 truncate text-left">
                    {project.name || "Untitled Project"}
                  </span>
                </button>
              </div>
              {expanded ? (
                <div
                  className="pl-7 mt-0.5 mb-1 space-y-0.5 border-l ml-3"
                  style={{ borderColor: "var(--border-primary)" }}
                >
                  {isLoading && folders.length === 0 ? (
                    <span className="text-[10px] px-2" style={{ color: "var(--text-tertiary)" }}>
                      加载中…
                    </span>
                  ) : null}
                  {folders.map((f) => {
                    const folderActive =
                      projectHighlighted && workspaceFolderRelativePath === f.relativePath;
                    const badge = workspaceFolderKindBadge(f.kind);
                    return (
                      <div key={f.relativePath} className="flex items-center gap-0.5 group">
                        <button
                          type="button"
                          className={`flex-1 text-left text-[11px] px-2 py-1 rounded-[var(--radius-md)] truncate sidebar-item mb-0 ${
                            folderActive ? "active" : ""
                          }`}
                          style={{
                            color: folderActive ? "var(--sidebar-active-fg)" : "var(--text-secondary)",
                          }}
                          onClick={() => openProject(project.id, f.relativePath)}
                        >
                          {badge ? <span className="opacity-60 mr-1">{badge}</span> : null}
                          {f.displayLabel}
                        </button>
                        <button
                          type="button"
                          className="p-0.5 opacity-70 hover:opacity-100 shrink-0"
                          style={{ color: "var(--text-tertiary)" }}
                          title="在访达中打开"
                          onClick={(e) => {
                            e.stopPropagation();
                            void revealProjectWorkspaceFolder(project.id, f.relativePath).catch(
                              () => {
                                /* 忽略 */
                              }
                            );
                          }}
                        >
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </SidebarSection>
  );
}
