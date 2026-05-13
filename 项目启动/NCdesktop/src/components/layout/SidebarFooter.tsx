import { Settings, CreditCard, Box } from "lucide-react";
import { useSyncStore } from "../../stores/syncStore";
import { invoke } from "@tauri-apps/api/core";

interface SidebarFooterProps {
  onSettingsOpen?: () => void;
}

export function SidebarFooter({ onSettingsOpen }: SidebarFooterProps) {
  const isTFCardConnected = useSyncStore((state) => state.isTFCardConnected);

  return (
    <div
      className="px-[8px] py-[10px]"
      style={{ borderTop: "1px solid var(--sidebar-divider)" }}
    >
      <div
        className="flex items-center gap-[8px] px-[8px] py-[6px] rounded-[var(--radius-md)] cursor-pointer transition-all"
        style={{ color: "var(--sidebar-text)" }}
        onClick={onSettingsOpen}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover-bg)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <div
          className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
          style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
        >
          U
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-medium" style={{ color: "var(--sidebar-text)" }}>用户</div>
          <div className="text-[10px]" style={{ color: "var(--sidebar-text-dim)" }}>设置</div>
        </div>
      </div>
    </div>
  );
}
