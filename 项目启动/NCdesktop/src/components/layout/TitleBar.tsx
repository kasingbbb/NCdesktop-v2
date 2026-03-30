interface TitleBarProps {
  title?: string;
}

export function TitleBar({ title = "NoteCapt" }: TitleBarProps) {
  return (
    <header className="titlebar-drag-region glass-toolbar flex items-center h-[52px] px-[var(--space-4)] relative">
      {/* macOS 红绿灯按钮区域留白（约 78px） */}
      <div className="w-[78px] shrink-0" />

      <div className="flex-1 flex items-center justify-center">
        <span
          className="text-[var(--text-sm)] tracking-[var(--tracking-wide)] uppercase font-medium"
          style={{ color: "var(--text-secondary)", letterSpacing: "0.08em" }}
        >
          {title}
        </span>
      </div>

      {/* 右侧工具按钮占位 */}
      <div className="w-[78px] shrink-0" />
    </header>
  );
}
