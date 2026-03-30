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
        label="Settings"
        onClick={onSettingsOpen}
      />
      <SidebarItem
        icon={<Box size={16} />}
        label="Dropzone"
        onClick={() => {
          invoke("toggle_dropzone_window").catch(console.error);
        }}
      />
      <SidebarItem
        icon={<CreditCard size={16} />}
        label={isTFCardConnected ? "TF Card Connected" : "No TF Card"}
        className={isTFCardConnected ? "connected" : "opacity-50"}
      />
    </div>
  );
}
