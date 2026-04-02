import { useState } from "react";
import { X, MoveRight, Copy, Trash2 } from "lucide-react";
import { useAssetStore } from "../../../stores/assetStore";
import { useProjectStore } from "../../../stores/projectStore";
import { useUIStore } from "../../../stores/uiStore";

interface BatchToolbarProps {
  selectedIds: Set<string>;
}

export function BatchToolbar({ selectedIds }: BatchToolbarProps) {
  const { moveAssets, copyAssets, deleteAsset, clearSelection } = useAssetStore();
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const addNotification = useUIStore((s) => s.addNotification);

  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false);

  if (selectedIds.size === 0) return null;

  const otherProjects = projects.filter((p) => p.id !== activeProjectId);
  const count = selectedIds.size;
  const ids = Array.from(selectedIds);

  async function handleMove(targetProjectId: string) {
    setShowMoveMenu(false);
    try {
      await moveAssets(ids, targetProjectId);
      addNotification({
        type: "success",
        title: "移动成功",
        message: `已将 ${count} 个素材移动到目标项目`,
        duration: 2500,
      });
    } catch (err) {
      addNotification({
        type: "error",
        title: "移动失败",
        message: String(err),
        duration: 4000,
      });
    }
  }

  async function handleCopy(targetProjectId: string) {
    setShowCopyMenu(false);
    try {
      await copyAssets(ids, targetProjectId);
      addNotification({
        type: "success",
        title: "复制成功",
        message: `已将 ${count} 个素材复制到目标项目`,
        duration: 2500,
      });
    } catch (err) {
      addNotification({
        type: "error",
        title: "复制失败",
        message: String(err),
        duration: 4000,
      });
    }
  }

  async function handleDelete() {
    if (!confirm(`确定要删除选中的 ${count} 个素材吗？此操作不可撤销。`)) return;
    for (const id of ids) {
      await deleteAsset(id).catch(() => {});
    }
    clearSelection();
    addNotification({
      type: "success",
      title: "已删除",
      message: `已删除 ${count} 个素材`,
      duration: 2000,
    });
  }

  return (
    <div
      className="shrink-0 flex items-center gap-2 px-3 py-2 mb-2 rounded-[var(--radius-lg)] border"
      style={{
        background: "var(--surface-elevated)",
        borderColor: "var(--border-active)",
        boxShadow: "var(--shadow-float)",
      }}
    >
      <span
        className="text-[var(--text-sm)] font-medium mr-1"
        style={{ color: "var(--text-primary)" }}
      >
        已选 {count} 个
      </span>

      {/* 移动 */}
      <div className="relative">
        <button
          type="button"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-[var(--text-xs)] font-medium transition-colors"
          style={{
            background: "var(--surface-tertiary)",
            color: "var(--text-primary)",
          }}
          onClick={() => { setShowMoveMenu((v) => !v); setShowCopyMenu(false); }}
        >
          <MoveRight size={13} />
          移动到
        </button>
        {showMoveMenu && (
          <ProjectPickerMenu
            projects={otherProjects}
            onPick={handleMove}
            onClose={() => setShowMoveMenu(false)}
          />
        )}
      </div>

      {/* 复制 */}
      <div className="relative">
        <button
          type="button"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-[var(--text-xs)] font-medium transition-colors"
          style={{
            background: "var(--surface-tertiary)",
            color: "var(--text-primary)",
          }}
          onClick={() => { setShowCopyMenu((v) => !v); setShowMoveMenu(false); }}
        >
          <Copy size={13} />
          复制到
        </button>
        {showCopyMenu && (
          <ProjectPickerMenu
            projects={otherProjects}
            onPick={handleCopy}
            onClose={() => setShowCopyMenu(false)}
          />
        )}
      </div>

      {/* 删除 */}
      <button
        type="button"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-[var(--text-xs)] font-medium transition-colors"
        style={{ color: "#FF3B30" }}
        onClick={() => void handleDelete()}
      >
        <Trash2 size={13} />
        删除
      </button>

      {/* 取消 */}
      <button
        type="button"
        className="ml-auto p-1 rounded-[var(--radius-sm)] transition-colors"
        style={{ color: "var(--text-tertiary)" }}
        onClick={clearSelection}
        title="取消选择 (Esc)"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function ProjectPickerMenu({
  projects,
  onPick,
  onClose,
}: {
  projects: Array<{ id: string; name: string }>;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* 点击外部关闭 */}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className="absolute left-0 top-full mt-1 z-30 min-w-[160px] rounded-[var(--radius-lg)] border py-1 overflow-hidden"
        style={{
          background: "var(--surface-elevated)",
          borderColor: "var(--border-primary)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {projects.length === 0 ? (
          <p
            className="px-3 py-2 text-[var(--text-xs)]"
            style={{ color: "var(--text-tertiary)" }}
          >
            无其他项目
          </p>
        ) : (
          projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-1.5 text-[var(--text-sm)] transition-colors"
              style={{ color: "var(--text-primary)" }}
              onMouseOver={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  "var(--surface-tertiary)")
              }
              onMouseOut={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "transparent")
              }
              onClick={() => onPick(p.id)}
            >
              {p.name}
            </button>
          ))
        )}
      </div>
    </>
  );
}
