import { Search, Clock, Star } from "lucide-react";
import { SidebarItem } from "./SidebarItem";
import { ProjectTree } from "../features/ProjectTree";
import { TagTree } from "../features/TagTree";
import { SidebarFooter } from "./SidebarFooter";
import { useUIStore } from "../../stores/uiStore";

interface SidebarProps {
  width: number;
  onSettingsOpen?: () => void;
  onSearchOpen?: () => void;
}

export function Sidebar({ width, onSettingsOpen, onSearchOpen }: SidebarProps) {
  const { activeSidebarSection, setSidebarSection } = useUIStore();

  return (
    <aside
      className="glass-sidebar flex flex-col h-full overflow-hidden"
      style={{ width: `${width}px` }}
    >
      {/* 品牌标识区 */}
      <div className="pt-[60px] px-[var(--space-4)] pb-[var(--space-3)]">
        <h1
          className="text-[var(--text-lg)] font-bold tracking-[var(--tracking-tight)]"
          style={{ color: "var(--brand-navy)" }}
        >
          NoteCapt
        </h1>
        <p
          className="text-[var(--text-xs)] mt-[var(--space-1)] uppercase tracking-[0.1em]"
          style={{ color: "var(--text-secondary)" }}
        >
          Knowledge Library
        </p>
      </div>

      {/* 导航列表 */}
      <nav className="flex-1 overflow-y-auto px-[var(--space-2)] py-[var(--space-1)]">
        <SidebarItem
          icon={<Search size={16} />}
          label="Search"
          active={activeSidebarSection === "search"}
          onClick={() => {
            setSidebarSection("search");
            onSearchOpen?.();
          }}
        />
        <SidebarItem
          icon={<Clock size={16} />}
          label="Recent"
          active={activeSidebarSection === "recent"}
          onClick={() => setSidebarSection("recent")}
        />
        <SidebarItem
          icon={<Star size={16} />}
          label="Starred"
          active={activeSidebarSection === "starred"}
          onClick={() => setSidebarSection("starred")}
        />

        <div className="h-px my-[var(--space-2)]" style={{ background: "var(--border-primary)" }} />

        <ProjectTree />

        <div className="h-px my-[var(--space-2)]" style={{ background: "var(--border-primary)" }} />

        <TagTree />
      </nav>

      {/* 底部状态栏 */}
      <SidebarFooter onSettingsOpen={onSettingsOpen} />
    </aside>
  );
}
