import { lazy, Suspense, useCallback, useMemo, useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppLayout } from "./components/layout/AppLayout";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import {
  useHydrateActiveProjectFromSettings,
  useFetchAssetsWhenProjectActive,
} from "./hooks/useProjectWorkspaceSync";
import { useUIStore } from "./stores/uiStore";
import { DropzoneApp } from "./components/features/dropzone/DropzoneApp";
import { useLibraryStore } from "./stores/libraryStore";
import { useProjectStore } from "./stores/projectStore";
import { useAssetStore } from "./stores/assetStore";
import { logger } from "./utils/logger";
import { DocumentViewer } from "./components/features/viewer/DocumentViewer";

interface ImportDropFinishedPayload {
  projectId: string;
  importProjectName: string;
}

const SearchPanel = lazy(() =>
  import("./components/features/SearchPanel").then((m) => ({ default: m.SearchPanel }))
);
const SettingsPanel = lazy(() =>
  import("./components/features/SettingsPanel").then((m) => ({ default: m.SettingsPanel }))
);

export default function App() {
  const isDropzone = useMemo(() => window.location.pathname === "/dropzone", []);

  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toggleInspector = useUIStore((s) => s.toggleInspector);
  const viewerAssetId = useUIStore((s) => s.viewerAssetId);
  const setViewerAssetId = useUIStore((s) => s.setViewerAssetId);
  const activeLibraryId = useLibraryStore((s) => s.activeLibraryId);
  const ensureActiveLibrary = useLibraryStore((s) => s.ensureActiveLibrary);
  const createProject = useProjectStore((s) => s.createProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const handleSearchOpen = useCallback(() => setSearchOpen(true), []);
  const handleNewProject = useCallback(() => {
    void (async () => {
      const libId = activeLibraryId ?? (await ensureActiveLibrary());
      const now = new Date();
      const name = `新建项目 ${now.toLocaleString()}`;
      const project = await createProject(libId, name);
      setActiveProject(project.id);
    })();
  }, [activeLibraryId, ensureActiveLibrary, createProject, setActiveProject]);

  useGlobalShortcuts({
    onSearchOpen: handleSearchOpen,
    onToggleInspector: toggleInspector,
    onNewProject: handleNewProject,
  });

  useEffect(() => {
    logger.info("App", "Application mounted", { isDropzone });
  }, [isDropzone]);

  useHydrateActiveProjectFromSettings();
  useFetchAssetsWhenProjectActive();

  useEffect(() => {
    if (isDropzone) return;

    const handleRefresh = (projectId: string) => {
      const tagId = useUIStore.getState().assetTagFilterId;
      if (tagId) {
        void useAssetStore.getState().fetchAssetsByTag(projectId, tagId);
      } else {
        void useAssetStore.getState().fetchAssets(projectId);
      }
      void (async () => {
        const lib = useLibraryStore.getState();
        const libId = lib.activeLibraryId ?? (await lib.ensureActiveLibrary());
        await useProjectStore.getState().fetchProjects(libId);
      })();
    };

    let unlistenImport: (() => void) | undefined;
    let unlistenAI: (() => void) | undefined;
    let cancelled = false;

    void listen<ImportDropFinishedPayload>("notecapt/import-drop-finished", (event) => {
      const { projectId } = event.payload;
      useProjectStore.getState().setActiveProject(projectId);
      handleRefresh(projectId);
    }).then((fn) => {
      if (!cancelled) unlistenImport = fn;
    });

    void listen<{ assetId: string; projectId: string }>("notecapt/dropzone-ai-finished", (event) => {
      const { projectId } = event.payload;
      handleRefresh(projectId);
    }).then((fn) => {
      if (!cancelled) unlistenAI = fn;
    });

    return () => {
      cancelled = true;
      unlistenImport?.();
      unlistenAI?.();
    };
  }, [isDropzone]);

  if (isDropzone) {
    return <DropzoneApp />;
  }

  return (
    <>
      <AppLayout
        onSettingsOpen={() => setSettingsOpen(true)}
        onSearchOpen={handleSearchOpen}
      />

      {viewerAssetId && (
        <DocumentViewer
          assetId={viewerAssetId}
          onClose={() => setViewerAssetId(null)}
        />
      )}

      <Suspense fallback={null}>
        {searchOpen && (
          <SearchPanel
            isOpen={searchOpen}
            onClose={() => setSearchOpen(false)}
          />
        )}
        {settingsOpen && (
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        )}
      </Suspense>
    </>
  );
}
