import { useUIStore } from "../../stores/uiStore";
import { useProjectStore } from "../../stores/projectStore";
import { Toolbar } from "./Toolbar";
import { ProjectListView } from "../features/ProjectListView";
import { AssetListView } from "../features/AssetListView";
import { AssetPreview } from "../features/AssetPreview";
import { CalendarWeekView } from "../features/calendar/CalendarWeekView";

export function ContentArea() {
  const { activeSidebarSection, inspectorOpen, rightPanelMode } = useUIStore();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  if (rightPanelMode !== "course_preview" && activeSidebarSection === "calendar") {
    return (
      <main
        className={`flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-[var(--surface-canvas)] p-3 ${inspectorOpen ? "border-r border-app" : ""}`}
      >
        <CalendarWeekView />
      </main>
    );
  }

  // Route to different views based on sidebar selection
  const isLibraryView = ["projects", "recent", "search", "starred"].includes(activeSidebarSection);

  if (isLibraryView) {
    return (
      <main
        className={`flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-[var(--surface-canvas)] p-3 ${inspectorOpen ? "border-r border-app" : ""}`}
      >
        <div
          className="flex flex-col flex-1 min-h-0 rounded-[var(--radius-xl)] border overflow-hidden bg-[var(--surface-primary)] min-w-0"
          style={{
            borderColor: "var(--border-primary)",
            boxShadow: "var(--shadow-float)",
          }}
        >
          <Toolbar />
          {activeProjectId ? <AssetListView /> : <ProjectListView />}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden p-[var(--space-4)] bg-[var(--surface-canvas)]">
      {/* 上半：素材预览区 */}
      <AssetPreview />

      {/* 下半：时间轴区域占位 */}
      <div
        className="h-[180px] shrink-0 border-t"
        style={{
          borderColor: "var(--border-primary)",
          background: "var(--surface-secondary)",
        }}
      >
        <div className="flex items-center justify-center h-full">
          <p
            className="text-[var(--text-sm)]"
            style={{ color: "var(--text-tertiary)" }}
          >
            Recording Axis — 时间轴将在此渲染
          </p>
        </div>
      </div>
    </main>
  );
}
