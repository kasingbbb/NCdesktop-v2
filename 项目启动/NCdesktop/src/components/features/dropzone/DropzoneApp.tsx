import { type DragEvent, useEffect } from "react";
import { GripHorizontal, MoveDiagonal2 } from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { useDropzoneStore, type DropzoneStore } from "../../../stores/dropzoneStore";
import * as cmd from "../../../lib/tauri-commands";
import { DropzoneIdle } from "./DropzoneIdle";
import { DropzoneAttract } from "./DropzoneAttract";
import { DropzoneProcessing } from "./DropzoneProcessing";
import { DropzoneComplete } from "./DropzoneComplete";
import { DropzoneExpanded } from "./DropzoneExpanded";
import { logger } from "../../../utils/logger";
import { formatDropzoneImportDetail } from "../../../lib/dropzone-import-detail";

function getDropzoneStore(): DropzoneStore {
  return useDropzoneStore.getState();
}

export function DropzoneApp() {
  const { phase: currentState, setPhase: setState, addItem, isExpanded } =
    useDropzoneStore();

  useEffect(() => {
    logger.info("DropzoneApp", "Phase changed", { phase: currentState });
  }, [currentState]);

  const simulateImport = (): void => {
    setState("processing");
    setTimeout(() => {
      addItem({
        id: Math.random().toString(),
        status: "done",
        fileName: "Mock File.png",
        fileType: "image/png",
        targetProjectId: null,
        addedAt: new Date().toISOString(),
      });
      setState("complete");
      setTimeout(() => setState("idle"), 2000);
    }, 1500);
  };

  useEffect(() => {
    let cancelled = false;
    let unlistenDrag: (() => void) | undefined;
    let unlistenAI: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (cancelled) return;

        const p = event.payload;

        if (p.type === "enter") {
          setState("attract");
          return;
        }
        if (p.type === "leave") {
          // 松手后常会先 drop 再 leave，避免把 processing/complete 打回 idle
          const phase = getDropzoneStore().phase;
          if (phase === "processing" || phase === "complete") {
            return;
          }
          setState("idle");
          return;
        }
        if (p.type === "over") {
          return;
        }
        if (p.type === "drop") {
          const paths = p.paths.filter((path) => path.length > 0);
          if (paths.length === 0) {
            addItem({
              id: `fail-${crypto.randomUUID()}`,
              status: "error",
              fileName: "未获取到文件路径，请从访达拖入文件",
              fileType: "error",
              targetProjectId: null,
              addedAt: new Date().toISOString(),
            });
            setState("idle");
            return;
          }

          void (async () => {
            const dz = getDropzoneStore();
            dz.setExpanded(true);
            dz.setProcessingUI("正在入库…", 0.45);
            setState("processing");
            try {
              const summary = await cmd.importDropPaths(paths);
              const projectHint =
                summary.importProjectName.trim().length > 0
                  ? ` · 主页左侧打开「${summary.importProjectName}」查看素材`
                  : "";

              for (const row of summary.created) {
                const detail =
                  formatDropzoneImportDetail(
                    row.aiClassified,
                    row.aiNote,
                    row.aiPending === true
                  ) + projectHint;
                addItem({
                  id: row.id,
                  status: "done",
                  fileName: row.name,
                  fileType: row.mimeType,
                  targetProjectId: row.projectId,
                  addedAt: row.importedAt,
                  detail,
                });
              }
              for (const msg of summary.failures) {
                addItem({
                  id: `fail-${crypto.randomUUID()}`,
                  status: "error",
                  fileName: msg,
                  fileType: "error",
                  targetProjectId: null,
                  addedAt: new Date().toISOString(),
                });
              }
              if (summary.created.length === 0 && summary.failures.length === 0) {
                addItem({
                  id: `fail-${crypto.randomUUID()}`,
                  status: "error",
                  fileName: "未能导入任何文件",
                  fileType: "error",
                  targetProjectId: null,
                  addedAt: new Date().toISOString(),
                });
              }
              setState("complete");
              setTimeout(() => setState("idle"), 4000);
            } catch (e) {
              addItem({
                id: `err-${crypto.randomUUID()}`,
                status: "error",
                fileName: String(e),
                fileType: "error",
                targetProjectId: null,
                addedAt: new Date().toISOString(),
              });
              setState("idle");
            } finally {
              getDropzoneStore().clearProcessingUI();
            }
          })();
        }
      })
      .then((fn) => {
        if (!cancelled) unlistenDrag = fn;
      })
      .catch((err) => {
        console.error("[dropzone] onDragDropEvent", err);
      });

    void listen<{ assetId: string }>("notecapt/dropzone-ai-finished", (event) => {
      if (cancelled) return;
      // 当 AI 分类完成后，尝试刷新该项的显示（显示已打标等）
      const item = getDropzoneStore().recentItems.find((i) => i.id === event.payload.assetId);
      if (item) {
        getDropzoneStore().updateItemDetail(item.id, "✨ AI 已完成自动分类与打标");
      }
    }).then((fn) => {
      if (!cancelled) unlistenAI = fn;
    });

    return () => {
      cancelled = true;
      unlistenDrag?.();
      unlistenAI?.();
    };
  }, [setState, addItem]);

  if (currentState === "hidden") return null;

  const handleDragEnter = (e: DragEvent): void => {
    e.preventDefault();
  };

  const handleDragLeave = (e: DragEvent): void => {
    e.preventDefault();
  };

  const handleDragOver = (e: DragEvent): void => {
    e.preventDefault();
  };

  const handleDrop = (e: DragEvent): void => {
    e.preventDefault();

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      simulateImport();
      return;
    }
    const text = e.dataTransfer.getData("text");
    if (text) {
      simulateImport();
      return;
    }
    // macOS WKWebView 从外部拖入时 files 通常为空，由 onDragDropEvent 的 paths 导入
  };

  const win = getCurrentWindow();

  return (
    <div
      className="w-screen h-screen flex flex-col select-none overflow-hidden relative p-2.5 box-border"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onContextMenu={(e) => e.preventDefault()}
      style={{ background: "var(--surface-secondary)" }}
    >
      <div
        className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-md border border-gray-200"
        style={{
          background: "var(--surface-primary)",
        }}
      >
        {/* 顶部拖动条 */}
        <div
          className="shrink-0 h-8 flex items-center justify-center gap-1.5 cursor-grab active:cursor-grabbing z-40 rounded-t-md border-b border-gray-200 bg-gray-50"
          onMouseDown={(e) => {
            if (e.button !== 0) {
              return;
            }
            void win.startDragging();
          }}
        >
          <GripHorizontal size={14} className="text-gray-500" />
          <span className="text-[10px] font-medium tracking-wide" style={{ color: "var(--text-secondary)" }}>
            拖动移动
          </span>
        </div>

        <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-2 pb-2">
          <div className="pointer-events-auto w-full max-w-[min(100%,360px)] flex flex-col items-center justify-center flex-1 min-h-0 py-2">
            {currentState === "idle" && <DropzoneIdle />}
            {currentState === "attract" && <DropzoneAttract />}
            {currentState === "processing" && <DropzoneProcessing />}
            {currentState === "complete" && <DropzoneComplete />}
          </div>
        </div>

        {isExpanded && (
          <div className="absolute inset-0 top-8 z-30 flex items-stretch justify-center p-3 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-[min(100%,380px)] min-h-0 flex flex-1">
              <DropzoneExpanded />
            </div>
          </div>
        )}

        {/* 右下角：缩放 */}
        <button
          type="button"
          aria-label="拖曳缩放窗口"
          className="absolute bottom-2.5 right-2.5 z-50 w-8 h-8 flex items-end justify-end p-0.5 cursor-nwse-resize border-0 bg-transparent rounded-br-[22px]"
          style={{ color: "var(--text-tertiary)" }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void win.startResizeDragging("SouthEast");
          }}
        >
          <MoveDiagonal2 size={14} className="opacity-70" />
        </button>
      </div>
    </div>
  );
}
