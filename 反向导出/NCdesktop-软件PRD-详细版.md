# NCdesktop Product Requirements Document (PRD)

## 1. Project Overview
NCdesktop (NoteCapt Desktop) is a multi-modal knowledge capture terminal designed for high-efficiency information gathering and synthesis. It bridges the gap between raw field recordings (audio, photos, scans) and structured knowledge suitable for LLM consumption.

### 1.1 Core Goals
- **Seamless Capture**: Hardware-to-software synchronization via TF cards and a global dropzone.
- **Dynamic Context**: Linking audio recordings with visual "Magic Moments" (photos/scans) through a synchronized timeline.
- **AI-Powered Synthesis**: Using LLMs to transcribe, analyze, and structure captured data for external tools like NotebookLM or ChatGPT.
- **Premium Experience**: A "Liquid Glass" design system providing a high-end, responsive, and translucent macOS-native feel.

### 1.2 Tech Stack
- **Framework**: Tauri v2 (Rust + React)
- **Frontend**: React 19, Vite 6, Tailwind CSS 4, Zustand
- **Backend/Storage**: Rust, SQLite (FTS5 searchable)
- **Design System**: Liquid Glass (Glassmorphism, 4px grid, CSS Variables)

---

## 2. Design philosophy: "Liquid Glass"
The UI must feel like a premium macOS application.
- **Materials**: Multi-layered glass translucency (L1-L5 elevation with varying blur and opacity).
- **Colors**: Navy Blue & Gold palette with subtle gradients.
- **Grid**: Strict 4px/8px baseline grid for all spacing.
- **Animations**: Smooth transitions using `ease-out-expo` curves.
- **Micro-interactions**: Hover pulses, magnetic playheads, and spring-loaded animations for a tactile feel.

---

## 3. Global UI Components

### 3.1 TitleBar
- **Height**: 52px.
- **Features**: Standard macOS traffic light controls (left, 78px inset), centered app title, and draggable area.
- **Material**: `glass-toolbar` (L3).

### 3.2 Sidebar (Navigation)
- **Width**: Draggable (160px - 300px), default 220px.
- **Sections**:
  - **Header**: Brand logo + Library selector.
  - **Primary Nav**: Search (⌘K), Recent, Starred.
  - **Knowledge Tree**: Hierarchical project list and frequently used tags.
  - **Footer**: Settings icon and device connection status (e.g., "TF Card Connected").

### 3.3 Inspector (Context Panel)
- **Width**: 320px, collapsible.
- **Content**:
  - **Asset Detail**: Metadata, large preview, file info.
  - **AI Analysis**: LLM-generated summary, classification, and key topics.
  - **Organization**: Tag management and session notes.

### 3.4 Global Dropzone (Separate Window)
- **State**: Floating, compact "NC" logo by default.
- **Interaction**:
  - **Idle**: Small bubble on the edge of the screen.
  - **Attract**: Expands/pulses when a file is dragged near.
  - **Processing**: Rotating progress ring during import/upload.
  - **Expanded**: List of the last 5 imported items with success/fail status.

---

## 4. Page-by-Page Requirements

### 4.1 Library Dashboard (Default View)
- **Purpose**: High-level overview of recent activity.
- **Elements**: 
  - "Continue Work" section with large thumbnails of 3-4 recent projects.
  - Cumulative stats (total capture hours, asset counts).
  - Quick-start buttons: "New Project", "Import from TF Card".

### 4.2 Project List View
- **Purpose**: Browsing projects within a selected library.
- **Layout**: Switchable between Grid (Cards) and List view.
- **Project Card**: 
  - Visual cover (latest photo or waveform preview).
  - Title, Date, and Duration.
  - Tag badges.
  - Star/Archive actions.

### 4.3 Project workspace (Asset Browser)
- **Purpose**: Exploring all assets (audio, images, scans) within a specific project.
- **Asset Grid**: 
  - Responsive layout with multi-select support.
  - **Audio Item**: Waveform sparkline preview.
  - **Photo/Scan Item**: High-quality thumbnail with aspect ratio support.
- **Toolbar**: Filter by type, sorting, and batch export.

### 4.4 Timeline Workspace (The "Soul" Feature)
- **Purpose**: Synchronized playback and annotation.
- **Waveform Area**: 
  - High-precision waveform (100 peaks/sec).
  - Interactive playhead with "Magnetic" snap to keyframes.
  - Time ruler with adaptive density.
- **Keyframe Track (Magic Moments)**:
  - Thumbnails floating above the waveform.
  - Grouping logic for multiple assets at the same timestamp.
  - **Interaction**: Click thumbnail to jump the playhead to that moment (with 5s pre-roll).
- **Transcription Panel**:
  - Scrollable text with speaker identification.
  - Real-time highlighting of the current sentence during playback.
  - Double-click to edit; search within transcript.

---

## 5. Advanced Features

### 5.1 Magic Moment Inter-linking
- **Sound to Image**: Playback automatically highlights the corresponding photo/scan when the playhead passes its anchor time.
- **Image to Sound**: Clicking a photo in the project library or timeline track instantly plays the audio context around that visual moment.

### 5.2 LLM Bridge (Export)
- **Modal Overlay**: "Export for LLM".
- **Selection**: Checklist of project components (Transcript, AI Summary, Metadata, Notes).
- **Targeting**: Presets for "NotebookLM", "ChatGPT", "Claude".
- **Result**: Markdown preview with an "AI Enhance" button to polish the structure before copying.

### 5.3 Global Search (⌘K)
- **Interface**: Centered Command Palette overlay.
- **Features**: 
  - Cross-project fuzzy search.
  - Filters for "Audio", "Images", "Tags", "Inside Transcription".
  - Quick navigation (arrow keys + Enter).

---

## 6. Feedback for UI Improvement
When improving the UI, the target AI should focus on:
1. **Glass Depth**: Ensure shadows and blurs differentiate stacked panels correctly.
2. **Typography**: Use a modern sans-serif stack (Inter/Outfit) with strict hierarchy.
3. **Motion**: All state changes (expanding sidebar, opening modals, playhead movement) should have fluid, physics-based animations.
4. **Coherence**: Ensure all 55+ IPC interactions feel instantaneous or provide appropriate loading feedback (skeletons/glass progress bars).
