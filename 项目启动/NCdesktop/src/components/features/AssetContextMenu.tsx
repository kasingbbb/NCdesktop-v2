import { useEffect, useRef, useState } from "react";
import type { WorkspaceFolderEntry } from "../../types";
import {
  moveAssetToWorkspaceFolder,
  revealProjectWorkspaceFolder,
} from "../../lib/tauri-commands";
import { useAssetStore } from "../../stores/assetStore";

interface AssetContextMenuProps {
  x: number;
  y: number;
  assetId: string;
  pane: "left" | "right";
  selectedAssetIds: Set<string>;
  workspaceFolders: WorkspaceFolderEntry[];
  projectId: string;
  /** 用于判断当前所在文件夹，灰显对应子菜单项 */
  currentFilePath: string;
  onClose: () => void;
  onMoved: () => void;
}


export function AssetContextMenu({
  x,
  y,
  assetId,
  selectedAssetIds,
  workspaceFolders,
  projectId,
  currentFilePath,
  onClose,
  onMoved,
}: AssetContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [subMenuOpen, setSubMenuOpen] = useState(false);
  const [moving, setMoving] = useState(false);

  // 操作目标：若右键的文件在选中集合中，则批量操作整个选中集合；否则只操作该文件
  const targetIds = selectedAssetIds.has(assetId)
    ? Array.from(selectedAssetIds)
    : [assetId];

  // 点击外部或按 Esc 关闭菜单
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // 计算菜单位置，确保不超出视口
  const menuWidth = 200;
  const subMenuWidth = 180;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const estimatedMenuHeight = 36 * 3 + 8; // 3 items + padding

  let menuLeft = x;
  let menuTop = y;
  if (menuLeft + menuWidth > viewportWidth) menuLeft = viewportWidth - menuWidth - 8;
  if (menuTop + estimatedMenuHeight > viewportHeight) menuTop = viewportHeight - estimatedMenuHeight - 8;

  // 子菜单是否在右侧还是左侧弹出
  const subMenuOnLeft = menuLeft + menuWidth + subMenuWidth > viewportWidth;

  /** 判断某个 folder 是否是当前文件所在目录（灰显） */
  function isCurrent(folder: WorkspaceFolderEntry): boolean {
    const fp = currentFilePath.replace(/\\/g, "/");
    const rel = folder.relativePath;
    if (rel === "__ROOT__") {
      // 根目录：文件的父目录即为 workspace root（不含子目录）
      // 简单判断：currentParentPath 不包含 folder 的任何子目录特征
      // 实际上：若文件在根目录，则父路径不包含任何 WorkspaceFolder 的 relativePath
      const subPaths = workspaceFolders
        .filter((f) => f.relativePath !== "__ROOT__")
        .map((f) => f.relativePath.replace(/^\/+/, ""));
      return !subPaths.some((sp) => fp.includes(`/${sp}/`) || fp.includes(`/${sp}`));
    }
    const cleanRel = rel.replace(/^\/+/, "");
    return fp.includes(`/${cleanRel}/`) || fp.includes(`/${cleanRel}`);
  }

  async function handleMoveToFolder(folder: WorkspaceFolderEntry) {
    if (isCurrent(folder) || moving) return;
    setMoving(true);
    try {
      const targetRelativePath =
        folder.relativePath === "" ? "__ROOT__" : folder.relativePath;
      // task_004：move_asset_to_workspace_folder 收敛为单素材签名，
      // 多选场景在调用方逐一调用（PRD §5.1）。
      await moveAssetToWorkspaceFolder(targetIds, targetRelativePath, projectId);
      onMoved();
      onClose();
    } catch (err) {
      console.error("[AssetContextMenu] moveAssetToWorkspaceFolder failed:", err);
    } finally {
      setMoving(false);
    }
  }

  async function handleReveal() {
    try {
      await revealProjectWorkspaceFolder(projectId, "__ROOT__");
    } catch (err) {
      console.error("[AssetContextMenu] revealProjectWorkspaceFolder failed:", err);
    }
    onClose();
  }

  async function handleDelete() {
    const label =
      targetIds.length === 1
        ? "确认删除此文件？"
        : `确认删除选中的 ${targetIds.length} 个文件？`;
    if (!window.confirm(label)) return;
    try {
      const { deleteAsset } = useAssetStore.getState();
      for (const id of targetIds) {
        await deleteAsset(id);
      }
    } catch (err) {
      console.error("[AssetContextMenu] deleteAsset failed:", err);
    }
    onClose();
  }

  // 构造要展示的文件夹列表（含根目录）
  const rootFolder: WorkspaceFolderEntry = {
    relativePath: "__ROOT__",
    displayLabel: "根目录 /",
    kind: "root",
  };
  const allFolders: WorkspaceFolderEntry[] = [
    rootFolder,
    ...workspaceFolders.filter((f) => f.relativePath !== "__ROOT__" && f.relativePath !== ""),
  ];

  const menuItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "7px 12px",
    fontSize: 13,
    color: "var(--text-primary)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    borderRadius: "var(--radius-sm)",
    transition: "background 0.1s",
  };

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: menuTop,
    left: menuLeft,
    width: menuWidth,
    background: "var(--bg-primary, var(--surface-primary))",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-float, 0 8px 24px rgba(0,0,0,0.18))",
    zIndex: 1000,
    padding: "4px",
    userSelect: "none",
  };

  const subMenuStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    ...(subMenuOnLeft ? { right: menuWidth - 4 } : { left: menuWidth - 4 }),
    width: subMenuWidth,
    background: "var(--bg-primary, var(--surface-primary))",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-float, 0 8px 24px rgba(0,0,0,0.18))",
    zIndex: 1001,
    padding: "4px",
    userSelect: "none",
    maxHeight: 320,
    overflowY: "auto",
  };

  return (
    <div ref={menuRef} style={menuStyle} role="menu" aria-label="上下文菜单">
      {/* 移到文件夹 */}
      <div
        style={{ position: "relative" }}
        onMouseEnter={() => setSubMenuOpen(true)}
        onMouseLeave={() => setSubMenuOpen(false)}
      >
        <button
          type="button"
          style={menuItemStyle}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--surface-secondary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          <span style={{ flex: 1 }}>移到文件夹</span>
          <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>▶</span>
        </button>

        {subMenuOpen && (
          <div style={subMenuStyle} role="menu" aria-label="目标文件夹">
            {allFolders.length === 0 ? (
              <div
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                }}
              >
                暂无文件夹
              </div>
            ) : (
              allFolders.map((folder) => {
                const current = isCurrent(folder);
                return (
                  <button
                    key={folder.relativePath}
                    type="button"
                    disabled={current || moving}
                    style={{
                      ...menuItemStyle,
                      opacity: current ? 0.4 : 1,
                      pointerEvents: current ? "none" : "auto",
                      cursor: current ? "default" : "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (!current) {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "var(--surface-secondary)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "transparent";
                    }}
                    onClick={() => void handleMoveToFolder(folder)}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-tertiary)",
                        marginRight: 2,
                      }}
                    >
                      📁
                    </span>
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {folder.displayLabel}
                    </span>
                    {current && (
                      <span
                        style={{ fontSize: 10, color: "var(--text-tertiary)" }}
                      >
                        当前
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 分割线 */}
      <div
        style={{
          margin: "3px 0",
          height: 1,
          background: "var(--border-primary)",
          opacity: 0.6,
        }}
      />

      {/* 在 Finder 中显示 */}
      <button
        type="button"
        style={menuItemStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--surface-secondary)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
        onClick={() => void handleReveal()}
      >
        在 Finder 中显示
      </button>

      {/* 分割线 */}
      <div
        style={{
          margin: "3px 0",
          height: 1,
          background: "var(--border-primary)",
          opacity: 0.6,
        }}
      />

      {/* 删除 */}
      <button
        type="button"
        style={{
          ...menuItemStyle,
          color: "#FF3B30",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "rgba(255,59,48,0.08)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
        onClick={() => void handleDelete()}
      >
        {targetIds.length > 1 ? `删除 ${targetIds.length} 个文件` : "删除"}
      </button>
    </div>
  );
}
