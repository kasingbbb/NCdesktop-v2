# NoteCapt Desktop — 交互优化开发文档

> 版本：v2.0（基于真实源码分析）· 2026-05-02  
> 技术栈：Tauri 2 + React 18 + TypeScript + Zustand + TailwindCSS v4  
> 原则：**在现有代码基础上最小化改动，不重写架构**

---

## 总览：需要改动的文件

| 优先级 | 文件 | 改动类型 | 说明 |
|--------|------|----------|------|
| P0 | `src/components/layout/Inspector.tsx` | 重构 | 切换器从右下角浮动胶囊 → Header 内 Segmented Control |
| P0 | `src/components/layout/Sidebar.tsx` | 小改 | 导航标签全部统一中文 |
| P0 | `src/components/layout/SidebarFooter.tsx` | 小改 | 底部菜单项统一中文 |
| P0 | `src/components/layout/TitleBar.tsx` | 重构 | 静态标题 → 面包屑导航 |
| P1 | `src/components/features/SearchPanel.tsx` | 重构 | 全屏模态 → Command Palette 样式 |
| P1 | `src/components/features/AssetListView.tsx` | 小改 | loading 时显示骨架屏 |
| P1 | `src/styles/glass.css` | 追加 | 按钮语义变体、骨架屏、Toast 动效 |
| P1 | `src/styles/globals.css` | 追加 | cmdEnter keyframe |
| P2 | `src/components/layout/Toolbar.tsx` | 小改 | 搜索框改为 ⌘K 触发入口 |
| P2 | `src/App.tsx` | 小改 | 挂载 ToastContainer（利用已有 Notification 系统） |

**无需修改**（现有代码已正确）：
- `src/hooks/useGlobalShortcuts.ts` — ⌘K 已注册 ✓
- `src/stores/uiStore.ts` — 状态完整，含 `addNotification` ✓  
- `src/components/layout/AppLayout.tsx` — 三栏布局逻辑正确 ✓
- `src/components/features/assets/BatchToolbar.tsx` — 已用 `addNotification` ✓

---

## 1. Inspector.tsx — 切换器重构（P0）

### 问题
当前切换器是 `absolute bottom-3 right-3` 浮动胶囊，用户需要将鼠标移到右下角才能切换面板模式，操作路径过长。

### 目标
切换器移至 Inspector Header 内，三个标签页（详情 / 时间流 / 知识关联）用 Segmented Control 展示，与内容区距离最近。

### `RightPanelMode` 类型确认
查阅 `src/types/ui.ts`：
```ts
export type RightPanelMode =
  | "inspector"
  | "timeline-flow"
  | "course_preview"
  | "knowledge_association";
```

### 完整替换代码

```tsx
// src/components/layout/Inspector.tsx
import { X, MousePointerClick } from "lucide-react";
import { useUIStore } from "../../stores/uiStore";
import { useAssetStore } from "../../stores/assetStore";
import { InspectorDetails } from "./InspectorDetails";
import { InspectorAI } from "./InspectorAI";
import { InspectorTags } from "./InspectorTags";
import { InspectorExtraction } from "./InspectorExtraction";
import { TimelineFlowView } from "../features/timeline-flow/TimelineFlowView";
import { KnowledgeAssociationView } from "../features/knowledge/KnowledgeAssociationView";

interface InspectorProps {
  width?: number;
}

// 仅展示三个常规模式；course_preview 由 ContentArea 路由控制，Inspector 不负责
const TABS: { key: "inspector" | "timeline-flow" | "knowledge_association"; label: string }[] = [
  { key: "inspector",             label: "详情"   },
  { key: "timeline-flow",         label: "时间流" },
  { key: "knowledge_association", label: "知识关联" },
];

export function Inspector({ width = 320 }: InspectorProps) {
  const { inspectorOpen, toggleInspector, rightPanelMode, setRightPanelMode } = useUIStore();
  const { selectedAssetId, assets } = useAssetStore();

  if (!inspectorOpen) return null;

  const activeAsset = assets.find((a) => a.id === selectedAssetId);

  // course_preview 模式下 Inspector 不渲染（ContentArea 全屏接管）
  if (rightPanelMode === "course_preview") return null;

  return (
    <aside
      className="h-full shrink-0 border-l flex flex-col relative min-w-0"
      style={{
        width,
        borderColor: "var(--border-primary)",
        background: "var(--surface-primary)",
      }}
    >
      {/* ── Header：Segmented Control + 关闭 ── */}
      <div
        className="h-[48px] flex items-center justify-between px-[var(--space-3)] border-b shrink-0 gap-[var(--space-2)]"
        style={{ borderColor: "var(--border-primary)" }}
      >
        {/* Segmented Control */}
        <div
          className="flex rounded-[var(--radius-full)] p-[3px] gap-[2px] flex-1 min-w-0"
          style={{
            background: "var(--surface-tertiary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          {TABS.map((tab) => {
            const isActive = rightPanelMode === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                className="flex-1 px-[var(--space-2)] py-[4px] rounded-[var(--radius-full)] text-[11px] font-medium
                           transition-all truncate"
                style={{
                  background:   isActive ? "var(--surface-primary)" : "transparent",
                  color:        isActive ? "var(--text-primary)"    : "var(--text-tertiary)",
                  boxShadow:    isActive ? "var(--shadow-sm)"       : "none",
                  transitionDuration: "var(--duration-fast)",
                  transitionTimingFunction: "var(--ease-out-expo)",
                }}
                onClick={() => setRightPanelMode(tab.key)}
                aria-pressed={isActive}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={toggleInspector}
          className="w-[24px] h-[24px] flex items-center justify-center
                     rounded-[var(--radius-sm)] transition-colors shrink-0"
          style={{ color: "var(--text-tertiary)" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = "var(--surface-tertiary)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = "transparent")
          }
          aria-label="关闭右栏"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Body ── */}
      <div
        className={`flex-1 min-h-0 overflow-hidden flex flex-col pb-0 ${
          rightPanelMode === "timeline-flow"
            ? "p-[var(--space-3)]"
            : "p-[var(--space-4)]"
        }`}
      >
        {rightPanelMode === "knowledge_association" ? (
          <div className="flex-1 min-h-0 flex flex-col min-w-0 -m-[var(--space-4)]">
            <KnowledgeAssociationView />
          </div>
        ) : rightPanelMode === "timeline-flow" ? (
          <div className="flex-1 min-h-0 flex flex-col min-w-0">
            <TimelineFlowView />
          </div>
        ) : activeAsset ? (
          <div className="overflow-y-auto h-full min-h-0 space-y-[var(--space-4)]">
            <InspectorDetails asset={activeAsset} />
            <InspectorAI asset={activeAsset} />
            <InspectorExtraction asset={activeAsset} />
            <InspectorTags asset={activeAsset} />
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-[var(--space-3)] px-[var(--space-4)]">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: "var(--surface-tertiary)", color: "var(--text-tertiary)" }}
            >
              <MousePointerClick size={22} />
            </div>
            <p
              className="text-[var(--text-sm)] text-center font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              未选中素材
            </p>
            <p
              className="text-[var(--text-xs)] text-center leading-relaxed max-w-[200px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              在列表中选择一项，即可查看详情、AI 摘要与标签。
            </p>
          </div>
        )}
      </div>

      {/* ⚠️ 删除原有的 absolute 浮动切换胶囊 —— 整个 absolute bottom-3 right-3 的 div 全部移除 */}
    </aside>
  );
}
```

### 同步修改 Toolbar.tsx
原有知识关联按钮的 onClick 逻辑过于复杂（同时控制 `rightPanelMode` + `inspectorOpen`）。现在 Inspector Header 已有切换器，Toolbar 的按钮只需负责「打开 Inspector 并切到知识关联」：

```tsx
// Toolbar.tsx — 知识关联按钮 onClick，找到现有逻辑整段替换
onClick={() => {
  // 若 Inspector 未打开，打开并切换到知识关联
  if (!inspectorOpen) {
    setInspectorOpen(true);
    setRightPanelMode("knowledge_association");
    return;
  }
  // 若已在知识关联，关闭 Inspector
  if (rightPanelMode === "knowledge_association") {
    setInspectorOpen(false);
    return;
  }
  // 其他模式，切换到知识关联
  setRightPanelMode("knowledge_association");
}}
```

---

## 2. Sidebar.tsx — 导航标签统一中文（P0）

### 问题
Search / Recent / Starred / Calendar 四项使用英文，与知识系统区块（今日复习 / 知识库 / 技能）风格不一致。

### 修改

```tsx
// src/components/layout/Sidebar.tsx
// 仅修改 label 属性，其他逻辑不变

<SidebarItem
  icon={<Search size={16} />}
  label="搜索"          // ← 原: "Search"
  ...
/>
<SidebarItem
  icon={<Clock size={16} />}
  label="最近"          // ← 原: "Recent"
  ...
/>
<SidebarItem
  icon={<Star size={16} />}
  label="收藏"          // ← 原: "Starred"
  ...
/>
<SidebarItem
  icon={<CalendarDays size={16} />}
  label="日历"          // ← 原: "Calendar"
  ...
/>
```

---

## 3. SidebarFooter.tsx — 底部菜单统一中文（P0）

### 修改

```tsx
// src/components/layout/SidebarFooter.tsx
// 仅修改 label，逻辑不变

<SidebarItem
  icon={<Settings size={16} />}
  label="设置"                   // ← 原: "Settings"
  onClick={onSettingsOpen}
/>
<SidebarItem
  icon={<Box size={16} />}
  label="悬浮导入"                // ← 原: "Dropzone"
  onClick={() => { invoke("toggle_dropzone_window").catch(console.error); }}
/>
<SidebarItem
  icon={<CreditCard size={16} />}
  label={isTFCardConnected ? "TF 卡已连接" : "未插入 TF 卡"}  // ← 原: 英文
  className={isTFCardConnected ? "connected" : "opacity-50"}
/>
```

---

## 4. TitleBar.tsx — 面包屑导航（P0）

### 问题
始终显示静态「NoteCapt」文字，不传递任何导航上下文。Sidebar 已有品牌 Logo，TitleBar 应改为传递当前所在位置。

### 完整替换代码

```tsx
// src/components/layout/TitleBar.tsx
import { Settings } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";

interface TitleBarProps {
  onSettingsOpen?: () => void;
}

export function TitleBar({ onSettingsOpen }: TitleBarProps) {
  const activeProject = useProjectStore((s) => s.getActiveProject());

  return (
    <header
      className="titlebar-drag-region glass-titlebar flex items-center h-[48px] px-[var(--space-4)] relative"
    >
      {/* macOS 红绿灯留白 78px → 改为 80px 与 Sidebar 对齐 */}
      <div className="w-[80px] shrink-0" />

      {/* 面包屑 */}
      <div className="flex-1 flex items-center justify-center gap-[6px]" data-no-drag>
        {activeProject ? (
          <>
            <span
              className="text-[12px]"
              style={{ color: "rgba(255,255,255,0.38)" }}
            >
              项目列表
            </span>
            <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 11 }}>
              ›
            </span>
            <span
              className="text-[12px] font-medium max-w-[260px] truncate"
              style={{ color: "rgba(255,255,255,0.78)" }}
              title={activeProject.name}
            >
              {activeProject.name}
            </span>
          </>
        ) : (
          <span
            className="text-[11px] font-medium tracking-[0.08em] uppercase"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            NoteCapt
          </span>
        )}
      </div>

      {/* 右侧工具按钮区 */}
      <div
        className="w-[80px] shrink-0 flex items-center justify-end"
        data-no-drag
      >
        {onSettingsOpen && (
          <button
            type="button"
            onClick={onSettingsOpen}
            className="w-[26px] h-[26px] flex items-center justify-center
                       rounded-[var(--radius-sm)] transition-all"
            style={{ color: "rgba(255,255,255,0.32)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.32)";
            }}
            title="设置 (⌘,)"
            aria-label="打开设置"
          >
            <Settings size={13} />
          </button>
        )}
      </div>
    </header>
  );
}
```

### AppLayout.tsx 同步传 prop

```tsx
// src/components/layout/AppLayout.tsx
// TitleBar 已有 onSettingsOpen prop，只需确认传入：

<TitleBar onSettingsOpen={onSettingsOpen} />
// 原来是 <TitleBar /> 没有传 prop，改为上面这行
```

---

## 5. SearchPanel.tsx — Command Palette 样式（P1）

### 问题
现有 SearchPanel 是占满屏幕的半透明模态，视觉上较重。Command Palette 风格（居中小弹窗）更符合桌面应用惯例，且已有 `⌘K` 快捷键触发。

### 注意
- 搜索核心逻辑（`performSearch`、防抖、键盘导航）**保留不动**
- `SearchResultData` 类型来自 `SearchResultItem.tsx`，保持不变
- 仅替换 JSX 结构与样式

### 完整替换代码

```tsx
// src/components/features/SearchPanel.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Loader2, File, FolderOpen, Zap, Tag } from "lucide-react";
import { useSearchStore } from "../../stores";
import {
  SearchResultItem,
  type SearchResultData,
} from "./SearchResultItem";
import { logger } from "../../utils/logger";

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (result: SearchResultData) => void;
}

export function SearchPanel({ isOpen, onClose, onNavigate }: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [results, setResults] = useState<SearchResultData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { performSearch } = useSearchStore();

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      logger.debug("SearchPanel", "Performing search", { query });
      try {
        const raw = await performSearch(query);
        const mapped: SearchResultData[] = raw.map((r) => ({
          id: r.id,
          type: r.type as SearchResultData["type"],
          title: r.title,
          snippet: r.snippet,
          projectName: r.projectId ?? null,
          score: r.score,
        }));
        setResults(mapped);
        setActiveIndex(0);
      } catch (e) {
        logger.error("SearchPanel", "Search failed", { query, error: e });
      } finally {
        setIsSearching(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[activeIndex]) {
        onNavigate?.(results[activeIndex]);
        onClose();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, activeIndex, onNavigate, onClose]
  );

  if (!isOpen) return null;

  const typeIcon = (type: string) => {
    const iconProps = { size: 13 };
    if (type === "project") return <FolderOpen {...iconProps} />;
    if (type === "concept") return <Zap {...iconProps} />;
    if (type === "tag") return <Tag {...iconProps} />;
    return <File {...iconProps} />;
  };

  const typeLabel: Record<string, string> = {
    project: "项目",
    asset: "素材",
    transcription: "转写",
    concept: "概念",
    note: "笔记",
    tag: "标签",
  };

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{
        paddingTop: "clamp(60px, 10vh, 120px)",
        background: "rgba(0,0,0,0.32)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Palette 容器 */}
      <div
        className="w-[540px] max-w-[90vw] overflow-hidden rounded-[var(--radius-2xl)] border"
        style={{
          background: "var(--surface-primary)",
          borderColor: "var(--border-primary)",
          boxShadow: "var(--shadow-lg)",
          animation: "cmdEnter var(--duration-normal) var(--ease-out-expo)",
        }}
      >
        {/* 搜索输入行 */}
        <div
          className="flex items-center gap-[var(--space-3)] px-4 border-b"
          style={{ height: 52, borderColor: "var(--border-primary)" }}
        >
          {isSearching ? (
            <Loader2
              size={15}
              className="animate-spin shrink-0"
              style={{ color: "var(--text-tertiary)" }}
            />
          ) : (
            <Search
              size={15}
              className="shrink-0"
              style={{ color: "var(--text-tertiary)" }}
            />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索笔记、项目、标签…"
            className="flex-1 border-none outline-none bg-transparent"
            style={{ fontSize: 15, color: "var(--text-primary)" }}
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 flex items-center justify-center w-[22px] h-[22px] rounded-[var(--radius-sm)]
                       transition-colors"
            style={{ color: "var(--text-tertiary)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "var(--surface-tertiary)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "transparent")
            }
            aria-label="关闭"
          >
            <X size={12} />
          </button>
        </div>

        {/* 搜索结果列表 */}
        {results.length > 0 && (
          <div className="max-h-[340px] overflow-y-auto py-1.5">
            {results.map((r, i) => {
              const isActive = i === activeIndex;
              return (
                <button
                  key={r.id}
                  type="button"
                  className="w-full flex items-center gap-[var(--space-3)] px-4 py-2.5
                             transition-colors text-left"
                  style={{
                    background: isActive ? "var(--sidebar-active-bg)" : "transparent",
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => { onNavigate?.(r); onClose(); }}
                >
                  {/* 类型图标 */}
                  <div
                    className="w-7 h-7 rounded-[var(--radius-md)] flex items-center
                               justify-center shrink-0"
                    style={{
                      background: isActive ? "rgba(59,130,246,0.15)" : "var(--surface-tertiary)",
                      color: isActive ? "var(--sidebar-active-fg)" : "var(--text-tertiary)",
                    }}
                  >
                    {typeIcon(r.type)}
                  </div>

                  {/* 标题 + 片段 */}
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[13px] font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {r.title}
                    </div>
                    {r.snippet && (
                      <div
                        className="text-[11px] truncate mt-0.5"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {r.snippet}
                      </div>
                    )}
                  </div>

                  {/* 类型 Badge */}
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full border shrink-0"
                    style={{
                      background: "var(--surface-tertiary)",
                      borderColor: "var(--border-primary)",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    {typeLabel[r.type] ?? r.type}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 空结果 */}
        {query.trim() && !isSearching && results.length === 0 && (
          <div className="py-10 flex flex-col items-center gap-2">
            <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
              未找到「{query}」相关结果
            </p>
          </div>
        )}

        {/* Footer 快捷键提示 */}
        <div
          className="flex gap-4 px-4 py-2 border-t"
          style={{ borderColor: "var(--border-primary)" }}
        >
          {[["↑↓", "导航"], ["↵", "打开"], ["Esc", "关闭"]].map(([k, v]) => (
            <span
              key={k}
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              <kbd
                className="px-1.5 py-px rounded border"
                style={{
                  background: "var(--surface-tertiary)",
                  borderColor: "var(--border-primary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                }}
              >
                {k}
              </kbd>
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## 6. AssetListView.tsx — 骨架屏替换（P1）

### 找到以下 loading 代码段，整体替换

```tsx
// 原代码（约第 220 行）
if (isLoading) {
  return (
    <div className="flex-1 flex items-center justify-center p-[var(--space-6)]">
      <p className="text-[var(--text-sm)]" style={{ color: "var(--text-tertiary)" }}>
        加载素材中…
      </p>
    </div>
  );
}

// ↓ 替换为 ↓

if (isLoading) {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-[var(--space-4)]">
      <SkeletonAssetPanel />
    </div>
  );
}
```

### 新建骨架屏组件

```tsx
// src/components/features/assets/SkeletonAssetPanel.tsx

/** 双栏骨架屏 — 与 AssetListView 的实际布局完全对应 */
export function SkeletonAssetPanel() {
  return (
    <div
      className="flex flex-1 min-h-0 gap-0 overflow-hidden rounded-[var(--radius-xl)] border"
      style={{
        borderColor: "var(--border-primary)",
        background: "var(--surface-primary)",
        boxShadow: "var(--shadow-float)",
      }}
    >
      {/* 左栏：导入原件 */}
      <div
        className="flex flex-col border-r shrink-0"
        style={{ width: 360, borderColor: "var(--raw-pane-border)" }}
      >
        <div
          className="px-3 py-2 border-b shrink-0"
          style={{ background: "var(--raw-pane-bg)", borderColor: "var(--raw-pane-border)" }}
        >
          <div className="skeleton h-[13px] w-[56px] rounded mb-[6px]" />
          <div className="skeleton h-[10px] w-[96px] rounded" />
        </div>
        <div className="flex-1 overflow-hidden" style={{ background: "var(--raw-pane-bg)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRawRow key={i} />
          ))}
        </div>
      </div>

      {/* 右栏：工作区 */}
      <div className="flex flex-col flex-1 min-w-0">
        <div
          className="px-3 py-2 border-b shrink-0"
          style={{ background: "var(--surface-tertiary)", borderColor: "var(--border-primary)" }}
        >
          <div className="skeleton h-[13px] w-[48px] rounded mb-[6px]" />
          <div className="skeleton h-[10px] w-[160px] rounded" />
        </div>
        <div className="flex-1 overflow-hidden" style={{ background: "var(--surface-primary)" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonProcessedCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SkeletonRawRow() {
  return (
    <div
      className="flex items-center gap-2 px-3 border-b"
      style={{ height: 36, borderColor: "var(--raw-pane-border)" }}
    >
      <div className="skeleton w-[20px] h-[20px] rounded-[var(--radius-sm)] shrink-0" />
      <div className="skeleton h-[11px] flex-1 rounded" style={{ maxWidth: "68%" }} />
      <div className="skeleton h-[10px] w-[56px] rounded shrink-0" />
    </div>
  );
}

function SkeletonProcessedCard() {
  return (
    <div
      className="px-3 py-2.5 border-b flex flex-col gap-[6px]"
      style={{ borderColor: "var(--border-primary)" }}
    >
      <div className="flex items-center gap-2">
        <div className="skeleton w-[14px] h-[14px] rounded shrink-0" />
        <div className="skeleton h-[12px] rounded flex-1" style={{ maxWidth: "72%" }} />
        <div className="skeleton h-[18px] w-[32px] rounded shrink-0" />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="skeleton h-[18px] w-[40px] rounded-full" />
        <div className="skeleton h-[18px] w-[32px] rounded-full" />
        <div className="skeleton h-[10px] w-[72px] rounded ml-auto" />
      </div>
    </div>
  );
}
```

### AssetListView.tsx 顶部追加 import

```tsx
import { SkeletonAssetPanel } from "./assets/SkeletonAssetPanel";
```

---

## 7. glass.css + globals.css — 样式追加（P1）

### glass.css 末尾追加

```css
/* ═══════════════════════════════════════════════════════
   骨架屏
   ═══════════════════════════════════════════════════════ */

@keyframes skeleton-shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-tertiary) 25%,
    var(--surface-secondary) 50%,
    var(--surface-tertiary) 75%
  );
  background-size: 1200px 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
  border-radius: var(--radius-xs);
}

/* ═══════════════════════════════════════════════════════
   按钮语义变体（补充 btn-glass 不能覆盖的场景）
   ═══════════════════════════════════════════════════════ */

/* Primary */
.btn-primary {
  display: inline-flex; align-items: center; justify-content: center;
  gap: var(--space-2); height: 36px; padding: 0 var(--space-5);
  font-size: var(--text-sm); font-weight: 500; font-family: inherit;
  background: var(--brand-navy); color: #fff;
  border: 1px solid var(--brand-navy);
  border-radius: var(--radius-full); cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-expo);
  box-shadow: var(--shadow-sm); user-select: none;
}
.btn-primary:hover  { background: var(--brand-navy-light); }
.btn-primary:active { transform: scale(.97); transition-duration: var(--duration-instant); }
.btn-primary:disabled { opacity: .4; cursor: not-allowed; pointer-events: none; }

/* Secondary */
.btn-secondary {
  display: inline-flex; align-items: center; justify-content: center;
  gap: var(--space-2); height: 36px; padding: 0 var(--space-5);
  font-size: var(--text-sm); font-weight: 500; font-family: inherit;
  background: var(--surface-primary); color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-full); cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-expo);
  box-shadow: var(--shadow-sm); user-select: none;
}
.btn-secondary:hover  { background: var(--surface-secondary); border-color: var(--border-hover); }
.btn-secondary:active { transform: scale(.97); transition-duration: var(--duration-instant); }

/* Ghost */
.btn-ghost {
  display: inline-flex; align-items: center; justify-content: center;
  gap: var(--space-2); height: 36px; padding: 0 var(--space-4);
  font-size: var(--text-sm); font-weight: 500; font-family: inherit;
  background: transparent; color: var(--text-secondary);
  border: 1px solid transparent;
  border-radius: var(--radius-full); cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-expo);
  user-select: none;
}
.btn-ghost:hover  { background: var(--surface-tertiary); color: var(--text-primary); }
.btn-ghost:active { transform: scale(.97); transition-duration: var(--duration-instant); }

/* Danger */
.btn-danger {
  display: inline-flex; align-items: center; justify-content: center;
  gap: var(--space-2); height: 36px; padding: 0 var(--space-5);
  font-size: var(--text-sm); font-weight: 500; font-family: inherit;
  background: transparent; color: var(--color-danger);
  border: 1px solid rgba(255,59,48,.25);
  border-radius: var(--radius-full); cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-expo);
  user-select: none;
}
.btn-danger:hover  { background: rgba(255,59,48,.07); border-color: var(--color-danger); }
.btn-danger:active { transform: scale(.97); transition-duration: var(--duration-instant); }

/* 尺寸修饰（搭配任意变体使用） */
.btn-sm { height: 28px !important; padding: 0 var(--space-3) !important; font-size: var(--text-xs) !important; }
.btn-lg { height: 44px !important; padding: 0 var(--space-6) !important; font-size: var(--text-base) !important; }
.btn-icon-md { width: 36px !important; height: 36px !important; padding: 0 !important; border-radius: var(--radius-md) !important; }
.btn-icon-sm { width: 28px !important; height: 28px !important; padding: 0 !important; border-radius: var(--radius-sm) !important; }

/* ═══════════════════════════════════════════════════════
   标签颜色语义变体（补充 tag-chip 系列）
   ═══════════════════════════════════════════════════════ */

.tag-chip--green  { background: rgba(52,199,89,.08);  border-color: rgba(52,199,89,.3);  color: #15803d; }
.tag-chip--orange { background: rgba(255,149,0,.1);   border-color: rgba(255,149,0,.3);  color: #c2410c; }
.tag-chip--purple { background: rgba(139,92,246,.08); border-color: rgba(139,92,246,.3); color: #7c3aed; }
.tag-chip--red    { background: rgba(255,59,48,.08);  border-color: rgba(255,59,48,.3);  color: #dc2626; }
.tag-chip--gold   { background: rgba(255,192,0,.1);   border-color: rgba(255,192,0,.35); color: #92600a; }
/* blue 已是默认 .tag-chip 样式，无需重复 */
```

### globals.css 末尾追加

```css
/* Command Palette 入场动效 */
@keyframes cmdEnter {
  from { opacity: 0; transform: scale(0.97) translateY(-8px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);    }
}
```

---

## 8. Toolbar.tsx — 搜索栏改为 ⌘K 触发入口（P2）

### 找到无激活项目时的搜索 `<input>` 区块，整段替换

```tsx
// 原代码：真实 <input>，用户在 Toolbar 里搜索
<div className="input-glass flex items-center gap-2 max-w-md w-full px-3 py-1.5 rounded-[var(--radius-md)]">
  <Search size={16} style={{ color: "var(--text-tertiary)" }} />
  <input
    type="text"
    placeholder="Search projects..."
    ...
  />
</div>

// ↓ 替换为可点击的"假输入框"，点击触发 onSearchOpen ↓

<div
  role="button"
  tabIndex={0}
  className="flex items-center gap-2 max-w-sm w-full px-3 cursor-pointer
             rounded-[var(--radius-full)] border transition-colors"
  style={{
    background: "var(--surface-secondary)",
    borderColor: "var(--border-primary)",
    height: 32,
    minWidth: 180,
  }}
  onClick={onSearchOpen}           // onSearchOpen 已通过 props 传入 Toolbar
  onMouseEnter={(e) =>
    ((e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)")
  }
  onMouseLeave={(e) =>
    ((e.currentTarget as HTMLElement).style.borderColor = "var(--border-primary)")
  }
  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSearchOpen?.(); }}
  aria-label="打开全局搜索（⌘K）"
>
  <Search size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
  <span
    className="flex-1 text-[12px]"
    style={{ color: "var(--text-tertiary)" }}
  >
    搜索项目…
  </span>
  <kbd
    className="text-[10px] px-1.5 py-px rounded border shrink-0"
    style={{
      background: "var(--surface-tertiary)",
      borderColor: "var(--border-primary)",
      color: "var(--text-tertiary)",
      fontFamily: "var(--font-mono)",
    }}
  >
    ⌘K
  </kbd>
</div>
```

### Toolbar 的 onSearchOpen 从哪里来？

查看现有 Toolbar.tsx — 它通过 `useSearchStore` 的 `setQuery` 操作，但没有接受 `onSearchOpen` prop。需要在 ContentArea 中传入，或通过 `useUIStore` 的 `openModal` 控制。

**最简单方案**：在 Toolbar.tsx 里直接访问 App 层的 `onSearchOpen`，通过 ContentArea → Toolbar prop 链传递：

```tsx
// src/components/layout/ContentArea.tsx
// ContentArea 接收 onSearchOpen prop
interface ContentAreaProps {
  onSearchOpen?: () => void;
}
export function ContentArea({ onSearchOpen }: ContentAreaProps) {
  ...
  // 传给 Toolbar
  <Toolbar onSearchOpen={onSearchOpen} />
}

// src/components/layout/AppLayout.tsx
// AppLayout 已有 onSearchOpen，传给 ContentArea
<ContentArea onSearchOpen={onSearchOpen} />

// src/components/layout/Toolbar.tsx
interface ToolbarProps {
  onSearchOpen?: () => void;
}
export function Toolbar({ onSearchOpen }: ToolbarProps) { ... }
```

---

## 9. App.tsx — Toast 通知展示（P2）

### 现状
`uiStore` 已有完整的 `notifications` + `addNotification` + `removeNotification` 系统，但没有 UI 组件把它渲染出来。

### 新建 ToastContainer 组件

```tsx
// src/components/common/ToastContainer.tsx
import { CheckCircle2, AlertCircle, XCircle, Info, X } from "lucide-react";
import { useUIStore } from "../../stores/uiStore";

export function ToastContainer() {
  const notifications = useUIStore((s) => s.notifications);
  const removeNotification = useUIStore((s) => s.removeNotification);

  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {notifications.map((n) => (
        <ToastItem
          key={n.id}
          notification={n}
          onDismiss={() => removeNotification(n.id)}
        />
      ))}
    </div>
  );
}

const TYPE_CONFIG = {
  success: {
    icon: <CheckCircle2 size={14} />,
    color: "var(--color-success)",
    bg: "rgba(52,199,89,.1)",
  },
  warning: {
    icon: <AlertCircle size={14} />,
    color: "var(--color-warning)",
    bg: "rgba(255,149,0,.1)",
  },
  error: {
    icon: <XCircle size={14} />,
    color: "var(--color-danger)",
    bg: "rgba(255,59,48,.1)",
  },
  info: {
    icon: <Info size={14} />,
    color: "var(--color-accent)",
    bg: "rgba(59,130,246,.1)",
  },
} as const;

function ToastItem({
  notification,
  onDismiss,
}: {
  notification: { id: string; type: "success" | "warning" | "error" | "info"; title: string; message: string };
  onDismiss: () => void;
}) {
  const cfg = TYPE_CONFIG[notification.type];
  return (
    <div
      className="flex items-start gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-3)]
                 rounded-[var(--radius-lg)] border pointer-events-auto max-w-[300px]"
      style={{
        background: "var(--surface-elevated)",
        borderColor: "var(--border-primary)",
        boxShadow: "var(--shadow-md)",
        animation: "toastEnter var(--duration-normal) var(--ease-out-expo)",
      }}
    >
      <div
        className="w-[24px] h-[24px] rounded-full flex items-center justify-center shrink-0"
        style={{ background: cfg.bg, color: cfg.color }}
      >
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-[var(--text-sm)] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {notification.title}
        </p>
        {notification.message && (
          <p
            className="text-[var(--text-xs)] mt-0.5 leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {notification.message}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 w-[18px] h-[18px] flex items-center justify-center
                   rounded transition-colors"
        style={{ color: "var(--text-tertiary)" }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "var(--surface-tertiary)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "transparent")
        }
        aria-label="关闭通知"
      >
        <X size={11} />
      </button>
    </div>
  );
}
```

### globals.css 追加 Toast 动效

```css
@keyframes toastEnter {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0);    }
}
```

### App.tsx 挂载

```tsx
// src/App.tsx
import { ToastContainer } from "./components/common/ToastContainer";

// return 内，在最后追加：
return (
  <>
    <AppLayout ... />
    {viewerAssetId && <DocumentViewer ... />}
    <Suspense fallback={null}>
      {searchOpen && <SearchPanel ... />}
      {settingsOpen && <SettingsPanel ... />}
    </Suspense>
    <ToastContainer />   {/* ← 新增，挂在最外层 */}
  </>
);
```

### 现有 addNotification 调用示例（BatchToolbar.tsx 已有，无需改动）

```ts
// 任意组件内通知调用方式（保持现有 API）
addNotification({
  type: "success",
  title: "移动成功",
  message: `已将 ${count} 个素材移动到目标项目`,
  duration: 2500,   // ms，传 0 则不自动关闭
});
```

---

## 快捷键总表

| 快捷键 | 动作 | 注册位置 | 状态 |
|--------|------|----------|------|
| `⌘K` | 打开 Command Palette | `useGlobalShortcuts` | ✅ 已存在 |
| `⌘N` | 新建项目 | `useGlobalShortcuts` | ✅ 已存在 |
| `⌘I` | 切换 Inspector | `useGlobalShortcuts` | ✅ 已存在 |
| `⇧⌘D` | 切换 Dropzone 悬浮窗 | `useGlobalShortcuts` | ✅ 已存在 |
| `Space` | 素材快速预览 | `AssetListView` | ✅ 已存在 |
| `↵` | 全屏阅读器 | `AssetListView` | ✅ 已存在 |
| `⌘A` | 全选当前栏素材 | `AssetListView` | ✅ 已存在 |
| `Esc` | 清空选择 / 关闭弹层 | `AssetListView` + 各弹层 | ✅ 已存在 |

---

## 改动量化汇总

| 文件 | 增/删/改行数（估） | 风险 |
|------|-------------------|------|
| `Inspector.tsx` | 重写 ~80 行，删除浮动胶囊 ~30 行 | 低 |
| `Sidebar.tsx` | 改 4 个字符串 | 极低 |
| `SidebarFooter.tsx` | 改 3 个字符串 | 极低 |
| `TitleBar.tsx` | 重写 ~40 行 | 低 |
| `SearchPanel.tsx` | 重写 JSX ~100 行，逻辑不变 | 低 |
| `AssetListView.tsx` | 替换 loading 分支 ~6 行，新增 import 1 行 | 极低 |
| `glass.css` | 追加 ~80 行 | 极低 |
| `globals.css` | 追加 ~8 行 | 极低 |
| `ContentArea.tsx` | 新增 prop 透传 ~4 行 | 极低 |
| `Toolbar.tsx` | 替换搜索框 ~20 行，新增 prop ~2 行 | 低 |
| `App.tsx` | 追加 1 个 import + 1 行 JSX | 极低 |
| **新建文件** | `SkeletonAssetPanel.tsx` ~60 行，`ToastContainer.tsx` ~80 行 | 极低 |

---

*基于 `src/` 真实源码分析 · 对照 `NoteCapt UI System.html` 视觉规范执行*
