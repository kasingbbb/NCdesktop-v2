import { Settings, Search } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";

interface TitleBarProps {
  onSettingsOpen?: () => void;
  onSearchOpen?: () => void;
}

export function TitleBar({ onSettingsOpen, onSearchOpen }: TitleBarProps) {
  const activeProject = useProjectStore((s) => s.getActiveProject());

  return (
    <header
      className="titlebar-drag-region glass-titlebar flex items-center h-[48px] px-[var(--space-4)] relative"
    >
      {/* macOS 红绿灯留白 */}
      <div className="w-[80px] shrink-0" />

      {/* 面包屑 */}
      <div className="flex-1 flex items-center justify-center gap-[6px]" data-no-drag>
        {activeProject ? (
          <>
            <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.38)" }}>
              项目列表
            </span>
            <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 11 }}>›</span>
            <span
              className="text-[12px] font-medium max-w-[260px] truncate"
              style={{ color: "rgba(255,255,255,0.78)" }}
              title={activeProject.name}
            >
              {activeProject.name}
            </span>
          </>
        ) : (
          <span
            className="text-[11px] font-medium tracking-[0.08em] uppercase"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            NoteCapt
          </span>
        )}
      </div>

      {/* 右侧工具区：⌘K + 设置 */}
      <div className="w-[80px] shrink-0 flex items-center justify-end gap-[4px]" data-no-drag>
        {onSearchOpen && (
          <button
            type="button"
            onClick={onSearchOpen}
            className="w-[26px] h-[26px] flex items-center justify-center rounded-[var(--radius-sm)] transition-all"
            style={{ color: "rgba(255,255,255,0.32)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.32)";
            }}
            title="搜索 (⌘K)"
            aria-label="打开搜索"
          >
            <Search size={13} />
          </button>
        )}
        {onSettingsOpen && (
          <button
            type="button"
            onClick={onSettingsOpen}
            className="w-[26px] h-[26px] flex items-center justify-center rounded-[var(--radius-sm)] transition-all"
            style={{ color: "rgba(255,255,255,0.32)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.32)";
            }}
            title="设置 (⌘,)"
            aria-label="打开设置"
          >
            <Settings size={13} />
          </button>
        )}
      </div>
    </header>
  );
}
