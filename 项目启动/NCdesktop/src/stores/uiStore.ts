import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  LayoutMode,
  SidebarSection,
  ModalType,
  Notification,
  DropzoneState,
  RightPanelMode,
  CoursePreviewReturnTo,
  TodayTab,
} from "../types";

interface MagicMomentState {
  activeKeyframeId: string | null;
  highlightedKeyframeId: string | null;
  previewAssetId: string | null;
  isAnimating: boolean;
}

// ── SidebarSection 兼容迁移（ADR-001） ───────────────────────────
const VALID_SECTIONS: readonly SidebarSection[] = [
  "recent",
  "starred",
  "projects",
  "tags",
  "knowledge-hub",
  "today",
  "calendar",
] as const;

// 编译期断言：VALID_SECTIONS 与 union 保持同步
type _AssertCovers = Exclude<SidebarSection, (typeof VALID_SECTIONS)[number]> extends never
  ? true
  : false;
const _typeCheck: _AssertCovers = true;
void _typeCheck;

function devWarn(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
}

/** 把任意旧值/未知值/坏类型映射到合法新 SidebarSection（ADR-001 矩阵）。 */
export function migrateLegacySection(raw: unknown): SidebarSection {
  if (raw === null || raw === undefined) return "recent";
  if (typeof raw !== "string") {
    devWarn(`[uiStore] migrateLegacySection 非 string 输入 → recent:`, raw);
    return "recent";
  }
  if ((VALID_SECTIONS as readonly string[]).includes(raw)) {
    return raw as SidebarSection;
  }
  if (raw === "knowledge" || raw === "skills") {
    devWarn(`[uiStore] migrateLegacySection 旧值 "${raw}" → knowledge-hub`);
    return "knowledge-hub";
  }
  if (raw === "search") {
    devWarn(`[uiStore] migrateLegacySection 已删除值 "search" → recent`);
    return "recent";
  }
  devWarn(`[uiStore] migrateLegacySection 未知值 "${raw}" → recent`);
  return "recent";
}

function migrateLegacyTodayTab(raw: unknown): TodayTab | null {
  if (raw === "course-prep" || raw === "daily-review") return raw;
  return null;
}

interface UIStore {
  layoutMode: LayoutMode;
  activeSidebarSection: SidebarSection;
  inspectorOpen: boolean;
  rightPanelMode: RightPanelMode;
  sidebarWidth: number;
  activeModal: ModalType;
  notifications: Notification[];
  dropzone: DropzoneState;
  magicMoment: MagicMomentState;
  assetTagFilterId: string | null;
  workspaceFolderRelativePath: string | null;
  activeCourseEventId: string | null;
  coursePreviewReturnTo: CoursePreviewReturnTo | null;
  /** TodayView 上次活跃 Tab（持久化） */
  todayLastTab: TodayTab | null;
  /** 学习模式刚由 OFF→ON 的瞬态信号（不持久化） */
  _learningJustEnabled: boolean;

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
  setActiveCourseEventId: (id: string | null) => void;
  setCoursePreviewReturnTo: (target: CoursePreviewReturnTo | null) => void;
  setTodayLastTab: (tab: TodayTab | null) => void;
  setLearningJustEnabled: (flag: boolean) => void;
}

let notificationId = 0;

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
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
      activeCourseEventId: null,
      coursePreviewReturnTo: null,
      todayLastTab: null,
      _learningJustEnabled: false,

      setLayoutMode: (mode) => set({ layoutMode: mode }),

      // setter 入口拦截：任何写入都先走 migrateLegacySection（防 Dev 误传 / 旧 LS）
      setSidebarSection: (section) =>
        set({ activeSidebarSection: migrateLegacySection(section) }),

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

      setActiveCourseEventId: (id) => set({ activeCourseEventId: id }),

      setCoursePreviewReturnTo: (target) => set({ coursePreviewReturnTo: target }),

      setTodayLastTab: (tab) => set({ todayLastTab: tab }),

      setLearningJustEnabled: (flag) => set({ _learningJustEnabled: flag }),
    }),
    {
      name: "ui-store",
      version: 1,
      partialize: (s) => ({
        activeSidebarSection: s.activeSidebarSection,
        todayLastTab: s.todayLastTab,
      }),
      migrate: (persisted) => {
        const raw = (persisted as { activeSidebarSection?: unknown } | undefined)
          ?.activeSidebarSection;
        const rawTab = (persisted as { todayLastTab?: unknown } | undefined)
          ?.todayLastTab;
        return {
          activeSidebarSection: migrateLegacySection(raw),
          todayLastTab: migrateLegacyTodayTab(rawTab),
        };
      },
    },
  ),
);
