import { create } from "zustand";
import type {
  LayoutMode,
  SidebarSection,
  ModalType,
  Notification,
  DropzoneState,
  RightPanelMode,
} from "../types";

interface MagicMomentState {
  activeKeyframeId: string | null;
  highlightedKeyframeId: string | null;
  previewAssetId: string | null;
  isAnimating: boolean;
}

interface UIStore {
  layoutMode: LayoutMode;
  activeSidebarSection: SidebarSection;
  inspectorOpen: boolean;
  /** 右栏：Inspector 与时间流切换 */
  rightPanelMode: RightPanelMode;
  sidebarWidth: number;
  activeModal: ModalType;
  notifications: Notification[];
  dropzone: DropzoneState;
  magicMoment: MagicMomentState;
  /** 侧边栏选中的标签：仅展示当前项目下带该标签的素材 */
  assetTagFilterId: string | null;
  /** 工作区子文件夹筛选：`null` 为全部；`__ROOT__` 为项目根目录下直接文件 */
  workspaceFolderRelativePath: string | null;
  /** 全屏阅读器打开的素材 ID */
  viewerAssetId: string | null;

  setLayoutMode: (mode: LayoutMode) => void;
  setSidebarSection: (section: SidebarSection) => void;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  setRightPanelMode: (mode: RightPanelMode) => void;
  setSidebarWidth: (width: number) => void;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  addNotification: (n: Omit<Notification, "id" | "createdAt">) => void;
  removeNotification: (id: string) => void;
  setDropzone: (partial: Partial<DropzoneState>) => void;
  setMagicMoment: (partial: Partial<MagicMomentState>) => void;
  setAssetTagFilterId: (tagId: string | null) => void;
  setWorkspaceFolderRelativePath: (path: string | null) => void;
  setViewerAssetId: (id: string | null) => void;
}

let notificationId = 0;

export const useUIStore = create<UIStore>((set) => ({
  layoutMode: "three-column",
  activeSidebarSection: "recent",
  inspectorOpen: true,
  rightPanelMode: "inspector",
  sidebarWidth: 220,
  activeModal: null,
  notifications: [],
  dropzone: {
    isVisible: false,
    isDragOver: false,
    isProcessing: false,
    recentItems: [],
  },
  magicMoment: {
    activeKeyframeId: null,
    highlightedKeyframeId: null,
    previewAssetId: null,
    isAnimating: false,
  },
  assetTagFilterId: null,
  workspaceFolderRelativePath: null,
  viewerAssetId: null,

  setLayoutMode: (mode) => set({ layoutMode: mode }),

  setSidebarSection: (section) => set({ activeSidebarSection: section }),

  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),

  setInspectorOpen: (open) => set({ inspectorOpen: open }),

  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),

  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  openModal: (modal) => set({ activeModal: modal }),

  closeModal: () => set({ activeModal: null }),

  addNotification: (n) => {
    const id = String(++notificationId);
    const notification: Notification = {
      ...n,
      id,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({
      notifications: [...s.notifications, notification],
    }));
    if (n.duration > 0) {
      setTimeout(() => {
        set((s) => ({
          notifications: s.notifications.filter((item) => item.id !== id),
        }));
      }, n.duration);
    }
  },

  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),

  setDropzone: (partial) =>
    set((s) => ({
      dropzone: { ...s.dropzone, ...partial },
    })),

  setMagicMoment: () => {},

  setAssetTagFilterId: (tagId) => set({ assetTagFilterId: tagId }),

  setWorkspaceFolderRelativePath: (path) =>
    set({ workspaceFolderRelativePath: path }),

  setViewerAssetId: (id) => set({ viewerAssetId: id }),
}));
