# NCdesktop UI 布局详细提取

本文档重点提取了 `NCdesktop` 项目的纯 UI 布局细节、层级结构和样式信息，旨在为后续的 UI 优化和界面重构提供明确的参考。

## 1. 全局布局结构 (AppLayout)

应用采用响应式三栏/两栏/单栏切换的弹性玻璃模糊布局。

### 1.1 布局模式规则
- **≥1200px (Three-column)**: Sidebar + ContentArea + Inspector
- **700px - 1199px (Two-column)**: Sidebar + ContentArea (Inspector 隐藏)
- **<700px (Single-column)**: 仅显示 ContentArea (Sidebar 和 Inspector 隐藏)

### 1.2 根容器样式
- `flex flex-col h-screen w-screen overflow-hidden` (全屏 Flex 垂直流)。
- 顶部固定高度的 `TitleBar`。
- 下方为 `flex flex-1 overflow-hidden` 的横向主内容区，容纳三大面板。

---

## 2. 核心模块布局细节

### 2.1 TitleBar (标题栏)
- **高度**: 固定的 52px。
- **背景材质**: `glass-toolbar` 玻璃材质。
- **内部布局**: 绝对定位/横向排列，macOS 红绿灯区域左侧留白 78px 避让。
- **可移动区**: 标题栏大部分区域具备 `-webkit-app-region: drag`，用于拖动系统窗口。

### 2.2 Sidebar (侧边栏)
- **宽度**: 可通过 `ResizeHandle` 拽拉改变，默认 220px，最小 160px，最大 300px。
- **背景材质**: `glass-sidebar`。
- **内部流**: `flex flex-col h-full overflow-hidden` 垂直布局：
  - **顶部 (Brand Area)**: 固定的高度/内边距（`pt-[60px] px-[var(--space-4)] pb-[var(--space-3)]`），包含品牌名和副标题。
  - **中部 (Navigation List)**: `flex-1 overflow-y-auto px-[var(--space-2)] py-[var(--space-1)]` 自适应滚动区。
    - 快速导航区: Search, Recent, Starred。
    - 分隔线: `h-px my-[var(--space-2)]` 配 `var(--glass-border-subtle)`。
    - 树形导航: `ProjectTree` (项目树) 和 `TagTree` (标签树)。
  - **底部 (Footer)**: 固定在底部的状态栏与设置入口。

### 2.3 ContentArea (主内容区)
- **宽度**: `flex-1`（占据剩余所有可用空间）。
- **背景**: 配合当前路由，库视图时为 `rgba(0,0,0,0.2)`，资产视图时为内部组件控制。
- **内部布局 (两种状态)**:
  - **库视图 (Library View)**:
    - 垂直 `flex-col h-full overflow-hidden`。
    - 顶部 `Toolbar`。
    - 内容区为 `ProjectListView` 或 `AssetListView`。
  - **项目/资产视图 (Asset View)**: 
    - 垂直 `flex-col h-full overflow-hidden p-[var(--space-4)]`。
    - 上半部: `AssetPreview` 预览区域（主要空间）。
    - 下半部: 固定的 `h-[180px] shrink-0 border-t` 时间轴预留区域 (`TimelineView`)。

### 2.4 Inspector (全局检查器偏置栏)
- **宽度**: 固定 320px。
- **背景材质**: `glass-sidebar`。
- **边框**: 左侧边线 `border-l` 与主内容区分隔。
- **内部流**: `flex flex-col`：
  - **顶部 Header**: `h-[52px]`，`glass-toolbar` 材质，右侧有关闭按钮。
  - **主内容区**: `flex-1 overflow-y-auto p-[var(--space-4)]`。
    - 在这个滚动区内层叠了: `InspectorDetails` (元数据/属性), `InspectorAI` (AI 分析摘要), `InspectorTags` (标签和笔记分类)。

---

## 3. 具体业务界面布局

### 3.1 ProjectListView (项目列表/网格)
- **Grid View (网格模式)**:
  - 容器: `flex-1 overflow-y-auto p-[var(--space-4)]`。
  - 布局: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[var(--space-4)]`。
  - 项目卡片 (`ProjectCard`) 自适应宽度，展现缩略图、标题和徽章。
- **List View (列表模式)**:
  - 使用 `@tanstack/react-virtual` 渲染。
  - 绝对定位 `position: absolute` 计算滚动高度 `transform: translateY(...)` 实现百万级数据不卡顿的虚拟列表，单行高度 64px。

### 3.2 TimelineView (时间轴核心工作台)
- **容器**: `flex flex-col h-full`，塞在 `ContentArea` 的下半部 `180px` 高度内。
- **分层布局**:
  - **KeyframeTrack (关键帧图轨)**: 悬浮于波形上方。内部横向弹性布局根据时间戳转换对应像素点 X 坐标，绝对定位在 `72px` (轨道高度) 内容器内。
  - **Waveform Area (波形拖拉区)**: `relative flex-shrink-0 overflow-hidden cursor-grab`，高度固定 64px。包含双色波形描绘区、选区叠层 `SelectionOverlay` 和中间固定不动的游标指示器 `Playhead`。
  - **TimeRuler (时间刻度)**: 底部标尺，基于宽度/时间渲染 Canvas 刻度。
  - **PlaybackControls (播放条)**: 处于时间轴下方的操控组。

### 3.3 全局模态窗 & 侧面板体系
- **SearchPanel (全局搜索, ⌘K)**:
  - 悬浮居中，绝对定位 Overlay。
  - 背景模糊/防抖遮罩，中央为指令/搜索结果面板组合页。
- **SettingsPanel (设置面板)**:
  - 全屏 Overlay 居中呈现弹窗，左侧分类锚点列表，右侧宽版切换配置区。
- **DropzoneWindow (悬浮拖拽窗)**:
  - 一个独立的 Tauri 透明窗口，没有常规 UI 结构。
  - 悬浮靠边存在，根据拖拽互动触发交互球体收缩放大/动画变形，属于外置式 UI 重度依赖 Framer Motion/CSS 过渡的微动效区域。

---

## 4. UI 优化需重构与关注的重点 (设计需求反馈)
1. **Z轴光影层级**: 由于深度依赖玻璃材质，优化时应当严格调整各个 Pane 的阴影 (`box-shadow`) 定义，避免不同级玻璃面板叠加导致界面发灰。
2. **边缘 1px 高光边界**: 所有面板、卡片都应补充 1px 的反切角透明度线条来突显材质质感。
3. **Typography (字体层级排版)**: 各面板中的 24px, 14px, 12px 未见良好的相对缩放比值结构（通常用 rem 优化并对齐 baseline）。
4. **组件留白节奏**: `gap` 参数当前过多依赖基础变量（`var(--space-4)` 既用于内外边距也用在 gap 上），应将布局容器和展示卡片的间距进行区分（如 Section Gap, Component Gap, Element Gap）。
