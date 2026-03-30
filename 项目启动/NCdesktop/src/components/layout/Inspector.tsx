import { X, LayoutPanelLeft, GitBranch } from "lucide-react";
import { useUIStore } from "../../stores/uiStore";
import { useAssetStore } from "../../stores/assetStore";
import { InspectorDetails } from "./InspectorDetails";
import { InspectorAI } from "./InspectorAI";
import { InspectorTags } from "./InspectorTags";
import { TimelineFlowView } from "../features/timeline-flow/TimelineFlowView";

interface InspectorProps {
  /** 第三栏宽度（由 AppLayout 拖拽条控制） */
  width?: number;
}

export function Inspector({ width = 320 }: InspectorProps) {
  const { inspectorOpen, toggleInspector, rightPanelMode, setRightPanelMode } = useUIStore();
  const { selectedAssetId, assets } = useAssetStore();

  if (!inspectorOpen) return null;

  const activeAsset = assets.find((a) => a.id === selectedAssetId);

  return (
    <aside
      className="h-full shrink-0 border-l flex flex-col relative min-w-0"
      style={{
        width,
        borderColor: "var(--border-primary)",
        background: "var(--surface-primary)",
      }}
    >
      <div
        className="h-[52px] flex items-center justify-between px-[var(--space-3)] border-b shrink-0"
        style={{ borderColor: "var(--border-primary)" }}
      >
        <h2 className="text-[var(--text-sm)] font-medium" style={{ color: "var(--text-primary)" }}>
          {rightPanelMode === "inspector" ? "Inspector" : "时间流"}
        </h2>
        <button
          type="button"
          onClick={toggleInspector}
          className="p-1 rounded transition-colors"
          style={{ color: "var(--text-secondary)" }}
          aria-label="关闭右栏"
        >
          <X size={16} />
        </button>
      </div>

      <div
        className={`flex-1 min-h-0 overflow-hidden flex flex-col pb-14 ${
          rightPanelMode === "timeline-flow" ? "p-[var(--space-3)]" : "p-[var(--space-4)]"
        }`}
      >
        {rightPanelMode === "timeline-flow" ? (
          <div className="flex-1 min-h-0 flex flex-col min-w-0">
            <TimelineFlowView />
          </div>
        ) : activeAsset ? (
          <div className="overflow-y-auto h-full min-h-0 space-y-[var(--space-4)]">
            <InspectorDetails asset={activeAsset} />
            <InspectorAI asset={activeAsset} />
            <InspectorTags asset={activeAsset} />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-[var(--text-sm)] text-center px-[var(--space-4)]" style={{ color: "var(--text-tertiary)" }}>
              在素材列表中选择一项，即可在此查看详情与 AI 分析。
            </p>
          </div>
        )}
      </div>

      {/* 右下角：Inspector ↔ 时间流 */}
      <div className="absolute bottom-[var(--space-3)] right-[var(--space-3)] flex flex-col gap-2 items-end pointer-events-none">
        <div
          className="pointer-events-auto flex rounded-full border overflow-hidden bg-[var(--surface-primary)]"
          style={{
            borderColor: "var(--border-primary)",
            boxShadow: "var(--shadow-float)",
          }}
        >
          <button
            type="button"
            className="px-3 py-2 text-[11px] font-medium flex items-center gap-1.5 transition-colors"
            style={{
              background: rightPanelMode === "inspector" ? "var(--sidebar-active-bg)" : "transparent",
              color: rightPanelMode === "inspector" ? "var(--sidebar-active-fg)" : "var(--text-tertiary)",
            }}
            onClick={() => {
              setRightPanelMode("inspector");
            }}
            aria-pressed={rightPanelMode === "inspector"}
          >
            <LayoutPanelLeft size={14} />
            Inspector
          </button>
          <button
            type="button"
            className="px-3 py-2 text-[11px] font-medium flex items-center gap-1.5 transition-colors border-l"
            style={{
              borderColor: "var(--border-primary)",
              background: rightPanelMode === "timeline-flow" ? "var(--sidebar-active-bg)" : "transparent",
              color: rightPanelMode === "timeline-flow" ? "var(--sidebar-active-fg)" : "var(--text-tertiary)",
            }}
            onClick={() => {
              setRightPanelMode("timeline-flow");
            }}
            aria-pressed={rightPanelMode === "timeline-flow"}
          >
            <GitBranch size={14} />
            时间流
          </button>
        </div>
      </div>
    </aside>
  );
}
