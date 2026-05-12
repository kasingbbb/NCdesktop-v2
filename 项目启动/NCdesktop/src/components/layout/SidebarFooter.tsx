import { Settings, CreditCard, Box } from "lucide-react";
import { SidebarItem } from "./SidebarItem";
import { useSyncStore } from "../../stores/syncStore";
import { invoke } from "@tauri-apps/api/core";

interface SidebarFooterProps {
  onSettingsOpen?: () => void;
}

export function SidebarFooter({ onSettingsOpen }: SidebarFooterProps) {
  const isTFCardConnected = useSyncStore((state) => state.isTFCardConnected);

  return (
    <div className="px-[var(--space-3)] py-[var(--space-3)] border-t" style={{ borderColor: "var(--border-primary)" }}>
      <SidebarItem
        icon={<Settings size={16} />}
        label="设置"
        onClick={onSettingsOpen}
      />
      <SidebarItem
        icon={<Box size={16} />}
        label="悬浮导入"
        onClick={() => {
          invoke("toggle_dropzone_window").catch(console.error);
        }}
      />
      <SidebarItem
        icon={<CreditCard size={16} />}
        label={isTFCardConnected ? "TF 卡已连接" : "未插入 TF 卡"}
        className={isTFCardConnected ? "connected" : "opacity-50"}
      />
    </div>
  );
}
