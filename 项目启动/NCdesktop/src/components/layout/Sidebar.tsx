import { Clock, Star, CalendarDays, Network, Sun } from "lucide-react";
import { SidebarItem, SidebarSection } from "./SidebarItem";
import { ProjectTree } from "../features/ProjectTree";
import { TagTree } from "../features/TagTree";
import { SidebarFooter } from "./SidebarFooter";
import { useUIStore } from "../../stores/uiStore";
import { useEffectiveLearningSettings } from "../../stores/settingsStore";

interface SidebarProps {
  width: number;
  onSettingsOpen?: () => void;
  onSearchOpen?: () => void;
}

export function Sidebar({ width, onSettingsOpen }: SidebarProps) {
  const { activeSidebarSection, setSidebarSection } = useUIStore();
  const { showLearningFeatures } = useEffectiveLearningSettings();

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
        <SidebarSection title="工作区">
          <SidebarItem
            icon={<Clock size={16} />}
            label="最近"
            active={activeSidebarSection === "recent"}
            onClick={() => setSidebarSection("recent")}
          />
          <SidebarItem
            icon={<Star size={16} />}
            label="收藏"
            active={activeSidebarSection === "starred"}
            onClick={() => setSidebarSection("starred")}
          />
        </SidebarSection>

        <SidebarSection title="知识">
          <SidebarItem
            icon={<Network size={16} />}
            label="知识中心"
            active={activeSidebarSection === "knowledge-hub"}
            onClick={() => setSidebarSection("knowledge-hub")}
          />
        </SidebarSection>

        {showLearningFeatures ? (
          <SidebarSection title="学习中心" titleColor="var(--sidebar-group-learning)">
            <SidebarItem
              icon={<Sun size={16} />}
              label="今日"
              active={activeSidebarSection === "today"}
              onClick={() => setSidebarSection("today")}
            />
            <SidebarItem
              icon={<CalendarDays size={16} />}
              label="日历"
              active={activeSidebarSection === "calendar"}
              onClick={() => setSidebarSection("calendar")}
            />
          </SidebarSection>
        ) : null}

        <ProjectTree />

        <TagTree />
      </nav>

      {/* 底部状态栏 */}
      <SidebarFooter onSettingsOpen={onSettingsOpen} />
    </aside>
  );
}
