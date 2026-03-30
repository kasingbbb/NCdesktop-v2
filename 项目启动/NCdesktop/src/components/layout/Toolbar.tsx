import { Search, Plus, LayoutGrid, List, ArrowUpDown, ChevronLeft } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import { useSearchStore } from "../../stores/searchStore";
import { useLibraryStore } from "../../stores/libraryStore";
import { useAssetStore } from "../../stores/assetStore";

export function Toolbar() {
  const {
    viewMode: projectViewMode,
    setViewMode: setProjectViewMode,
    createProject,
    setActiveProject,
    activeProjectId,
    getActiveProject,
  } = useProjectStore();
  const assetViewMode = useAssetStore((s) => s.viewMode);
  const setAssetViewMode = useAssetStore((s) => s.setViewMode);
  const { activeLibraryId, ensureActiveLibrary } = useLibraryStore();
  const { query, setQuery } = useSearchStore();

  const activeProject = activeProjectId ? getActiveProject() : undefined;

  if (activeProjectId && activeProject) {
    return (
      <div
        className="h-[60px] flex items-center justify-between px-[var(--space-4)] border-b shrink-0 bg-[var(--surface-primary)]"
        style={{ borderColor: "var(--border-primary)" }}
      >
        <div className="flex items-center gap-[var(--space-3)] min-w-0">
          <button
            type="button"
            className="btn-glass flex items-center gap-1 px-[var(--space-2)] py-1.5 rounded-[var(--radius-md)] shrink-0"
            onClick={() => setActiveProject(null)}
          >
            <ChevronLeft size={18} />
            <span className="text-[var(--text-sm)]">项目</span>
          </button>
          <h2
            className="text-[var(--text-lg)] font-semibold truncate"
            style={{ color: "var(--text-primary)" }}
            title={activeProject.name}
          >
            {activeProject.name}
          </h2>
        </div>
        <div className="flex items-center gap-[var(--space-3)] shrink-0">
          <p className="text-[var(--text-xs)] hidden sm:block max-w-[220px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
            左栏原件名 · 右栏工作区名与标签 · 列表/图标
          </p>
          <div
            className="flex rounded-[var(--radius-lg)] p-0.5 border"
            style={{ borderColor: "var(--border-primary)", background: "var(--surface-tertiary)" }}
          >
            <button
              type="button"
              className={`p-1.5 rounded-[var(--radius-md)] transition-colors border border-transparent ${assetViewMode === "grid" ? "border-app" : ""}`}
              title="图标视图"
              onClick={() => {
                setAssetViewMode("grid");
              }}
              style={{
                color: assetViewMode === "grid" ? "var(--text-primary)" : "var(--text-tertiary)",
                background: assetViewMode === "grid" ? "var(--surface-primary)" : "transparent",
              }}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={`p-1.5 rounded-[var(--radius-md)] transition-colors border border-transparent ${assetViewMode === "list" ? "border-app" : ""}`}
              title="列表视图"
              onClick={() => {
                setAssetViewMode("list");
              }}
              style={{
                color: assetViewMode === "list" ? "var(--text-primary)" : "var(--text-tertiary)",
                background: assetViewMode === "list" ? "var(--surface-primary)" : "transparent",
              }}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-[60px] flex items-center justify-between px-[var(--space-4)] border-b shrink-0 bg-[var(--surface-primary)]"
      style={{ borderColor: "var(--border-primary)" }}
    >
      <div className="flex items-center gap-[var(--space-4)] flex-1">
        <h2 className="text-[var(--text-lg)] font-semibold" style={{ color: "var(--text-primary)" }}>
          Projects
        </h2>
        
        <div className="input-glass flex items-center gap-2 max-w-md w-full px-3 py-1.5 rounded-[var(--radius-md)]">
          <Search size={16} style={{ color: "var(--text-tertiary)" }} />
          <input 
            type="text" 
            placeholder="Search projects..." 
            className="bg-transparent border-none outline-none w-full text-[var(--text-sm)]"
            style={{ color: "var(--text-primary)" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-[var(--space-2)]">
        <button 
          className="btn-glass px-[var(--space-3)] py-1.5 rounded-[var(--radius-md)] flex items-center gap-2"
          style={{ background: "var(--brand-navy)", color: "#ffffff" }}
          onClick={() => {
            void (async () => {
              const libId = activeLibraryId ?? (await ensureActiveLibrary());
              const now = new Date();
              const name = `新建项目 ${now.toLocaleString()}`;
              const project = await createProject(libId, name);
              setActiveProject(project.id);
            })();
          }}
        >
          <Plus size={16} />
          <span className="text-[var(--text-sm)] font-medium">New</span>
        </button>

        <div className="w-px h-6 mx-[var(--space-2)]" style={{ background: "var(--border-primary)" }} />

        <button className="p-1.5 rounded-[var(--radius-md)] transition-colors" style={{ color: "var(--text-secondary)" }}>
          <ArrowUpDown size={16} />
        </button>

        <div className="flex rounded-[var(--radius-lg)] p-0.5 border" style={{ borderColor: "var(--border-primary)", background: "var(--surface-tertiary)" }}>
          <button 
            type="button"
            className={`p-1 rounded-[var(--radius-md)] transition-colors border border-transparent ${projectViewMode === 'grid' ? 'border-app' : ''}`}
            onClick={() => setProjectViewMode('grid')}
            style={{ 
              color: projectViewMode === 'grid' ? "var(--text-primary)" : "var(--text-tertiary)",
              background: projectViewMode === 'grid' ? "var(--surface-primary)" : "transparent",
            }}
          >
            <LayoutGrid size={16} />
          </button>
          <button 
            type="button"
            className={`p-1 rounded-[var(--radius-md)] transition-colors border border-transparent ${projectViewMode === 'list' ? 'border-app' : ''}`}
            onClick={() => setProjectViewMode('list')}
            style={{ 
              color: projectViewMode === 'list' ? "var(--text-primary)" : "var(--text-tertiary)",
              background: projectViewMode === 'list' ? "var(--surface-primary)" : "transparent",
            }}
          >
            <List size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
