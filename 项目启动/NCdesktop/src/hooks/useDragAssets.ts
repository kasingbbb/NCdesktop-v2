import { useCallback, useEffect, useRef } from "react";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { invoke } from "@tauri-apps/api/core";
import type { Asset } from "../types";

export const DRAG_ASSET_TYPE = "application/notecapt-assets";

export interface DragAssetPayload {
  assetIds: string[];
}

const DRAG_MOVE_THRESHOLD = 5;

export function useDragAssets(
  selectedAssetIds: Set<string>,
  assets: Asset[]
) {
  const pendingDragRef = useRef<{
    assetId: string;
    startX: number;
    startY: number;
  } | null>(null);
  const isDraggingRef = useRef(false);
  const dragIconRef = useRef<string>("");

  useEffect(() => {
    invoke<string>("get_drag_icon_path")
      .then((p) => {
        console.log("[drag] icon path:", p);
        dragIconRef.current = p;
      })
      .catch((e) => console.error("[drag] get_drag_icon_path failed:", e));
  }, []);

  const resolveFilePaths = useCallback(
    (ids: string[]): string[] => {
      return ids
        .map((id) => assets.find((a) => a.id === id)?.filePath)
        .filter((p): p is string => !!p);
    },
    [assets]
  );

  const makeDragProps = useCallback(
    (assetId: string) => {
      return {
        onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
          if (e.button !== 0) return;
          e.preventDefault(); // 阻止文本选中干扰拖拽
          console.log("[drag] mousedown on", assetId);
          pendingDragRef.current = {
            assetId,
            startX: e.clientX,
            startY: e.clientY,
          };
          isDraggingRef.current = false;

          // 将 mousemove/mouseup 挂到 window，确保鼠标移出卡片后仍能追踪
          function onMouseMove(ev: MouseEvent) {
            const pending = pendingDragRef.current;
            if (!pending || isDraggingRef.current) return;

            const dx = ev.clientX - pending.startX;
            const dy = ev.clientY - pending.startY;
            if (
              Math.abs(dx) < DRAG_MOVE_THRESHOLD &&
              Math.abs(dy) < DRAG_MOVE_THRESHOLD
            )
              return;

            isDraggingRef.current = true;
            pendingDragRef.current = null;
            cleanup();

            const ids = selectedAssetIds.has(pending.assetId)
              ? Array.from(selectedAssetIds)
              : [pending.assetId];
            const filePaths = resolveFilePaths(ids);
            console.log("[drag] threshold crossed, filePaths:", filePaths, "icon:", dragIconRef.current);
            if (filePaths.length === 0) {
              console.warn("[drag] no filePaths resolved for ids:", ids);
              return;
            }

            void startDrag({
              item: filePaths,
              icon: dragIconRef.current,
              mode: "copy",
            }).then(() => {
              console.log("[drag] startDrag success");
            }).catch((err) => {
              console.error("[drag] startDrag error:", err);
            });
          }

          function onMouseUp() {
            pendingDragRef.current = null;
            isDraggingRef.current = false;
            cleanup();
          }

          function cleanup() {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
          }

          window.addEventListener("mousemove", onMouseMove);
          window.addEventListener("mouseup", onMouseUp);
        },
      };
    },
    [selectedAssetIds, resolveFilePaths]
  );

  return { makeDragProps };
}
