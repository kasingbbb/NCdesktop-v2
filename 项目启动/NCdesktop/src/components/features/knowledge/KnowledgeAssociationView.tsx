/**
 * KnowledgeAssociationView — 知识关联主视图
 *
 * 布局（宪章 B5：ContentArea 平级视图）：
 *   顶部  统计栏（共 N 个概念 · M 个项目）+ 搜索框 + 筛选 + 重新扫描
 *   主体  两栏：左侧 ConceptList  |  右侧 ConceptDetailPanel
 *
 * 空状态：首次进入无概念数据时，显示扫描引导卡
 * 进度条：监听 notecapt/concept-extraction-progress Tauri 事件
 *
 * 约束（宪章 A1/A2）：named export，CSS 变量，无硬编码颜色
 */

import { useEffect, useState, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Search,
  RefreshCw,
  ScanLine,
  BrainCircuit,
} from "lucide-react";
import { useKnowledgeStore } from "../../../stores/knowledgeStore";
import { useKnowledgeUnderstandingStore } from "../../../stores/knowledgeUnderstandingStore";
import { useLibraryStore } from "../../../stores/libraryStore";
import { ConceptList } from "./ConceptList";
import { ConceptDetailPanel } from "./ConceptDetailPanel";
import { KnowledgeUnderstandingPage } from "../../KnowledgeUnderstanding/KnowledgeUnderstandingPage";
import type { ExtractionProgress } from "../../../types/knowledge";

// ─────────────────────────────────────────────────────────────────────────────

export function KnowledgeAssociationView() {
  const libraryId = useLibraryStore((s) => s.activeLibraryId) ?? "";
  const {
    concepts,
    selectedConceptId,
    conceptDetail,
    extractionProgress,
    searchQuery,
    isLoading,
    isLoadingDetail,
    error,
    fetchConcepts,
    selectConcept,
    updateConcept,
    startExtraction,
    setSearchQuery,
    setExtractionProgress,
    getFilteredConcepts,
    synthesizeViewpoints,
    generateExtensions,
  } = useKnowledgeStore();

  const understandingConceptId = useKnowledgeUnderstandingStore((s) => s.conceptId);
  const resetForConcept = useKnowledgeUnderstandingStore((s) => s.resetForConcept);
  const setUnderstandingConceptId = useKnowledgeUnderstandingStore((s) => s.setConceptId);

  const [scanStarted, setScanStarted] = useState(false);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // ── 初始化：加载概念列表 ─────────────────────────────────────────────────

  useEffect(() => {
    if (!libraryId) return;
    void fetchConcepts(libraryId);
  }, [libraryId]);

  // ── 监听提取进度事件 ─────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    void listen<ExtractionProgress & { libraryId: string }>(
      "notecapt/concept-extraction-progress",
      (event) => {
        if (!cancelled) {
          setExtractionProgress({
            totalAssets: event.payload.totalAssets,
            processed: event.payload.processed,
            conceptsFound: event.payload.conceptsFound,
            status: event.payload.status,
          });
        }
      }
    ).then((fn) => {
      if (!cancelled) unlistenRef.current = fn;
      else fn();
    });

    return () => {
      cancelled = true;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, []);

  // ── 处理「开始扫描」 ─────────────────────────────────────────────────────

  const handleStartScan = (force = false) => {
    setScanStarted(true);
    void startExtraction(libraryId, force);
  };

  const handleEnterUnderstanding = (conceptId: string) => {
    resetForConcept(conceptId);
  };

  const handleBackFromUnderstanding = () => {
    setUnderstandingConceptId(null);
  };

  const filteredConcepts = getFilteredConcepts();
  const isExtracting = extractionProgress?.status === "running";
  const isEmpty = concepts.length === 0 && !isLoading && !isExtracting;

  // 深入理解视图：当 understandingConceptId 有值时切换
  if (understandingConceptId) {
    const understandingConceptName =
      concepts.find((c) => c.id === understandingConceptId)?.name ??
      conceptDetail?.concept.name ??
      "";

    return (
      <KnowledgeUnderstandingPage
        conceptId={understandingConceptId}
        conceptName={understandingConceptName}
        onBack={handleBackFromUnderstanding}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 渲染
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--surface-primary)]">

      {/* ── 顶部统计 + 工具栏 ── */}
      <div
        className="flex-shrink-0 flex items-center gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)] border-b"
        style={{ borderColor: "var(--border-primary)" }}
      >
        {/* 标题 + 统计 */}
        <div className="flex items-center gap-[var(--space-2)] flex-shrink-0">
          <BrainCircuit size={16} style={{ color: "var(--brand-navy)" }} />
          <span
            className="text-[var(--text-base)] font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            知识关联
          </span>
          {concepts.length > 0 && (
            <span
              className="text-[var(--text-xs)] px-[var(--space-2)] py-px rounded-full"
              style={{
                background: "var(--surface-tertiary)",
                color: "var(--text-tertiary)",
              }}
            >
              {concepts.length} 个概念
            </span>
          )}
        </div>

        {/* 搜索框 */}
        <div
          className="flex items-center gap-[var(--space-2)] flex-1 max-w-xs px-[var(--space-3)] py-[var(--space-1)] rounded-[var(--radius-md)]"
          style={{
            background: "var(--surface-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <Search size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="搜索概念…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none flex-1 text-[var(--text-sm)]"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        {/* 右侧按钮组 */}
        <div className="flex items-center gap-[var(--space-2)] ml-auto flex-shrink-0">
          {/* 重新扫描 */}
          <button
            type="button"
            disabled={isExtracting}
            onClick={() => handleStartScan(true)}
            className="flex items-center gap-[var(--space-1)] px-[var(--space-3)] py-[var(--space-1)] rounded-[var(--radius-md)] text-[var(--text-xs)] transition-colors"
            style={{
              background: "var(--surface-secondary)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-secondary)",
              opacity: isExtracting ? 0.5 : 1,
            }}
          >
            <RefreshCw size={12} className={isExtracting ? "animate-spin" : ""} />
            重新扫描
          </button>
        </div>
      </div>

      {/* ── 提取进度条 ── */}
      {isExtracting && extractionProgress && (
        <ExtractionProgressBar progress={extractionProgress} />
      )}

      {/* ── 错误提示 ── */}
      {error && (
        <div
          className="mx-[var(--space-4)] mt-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-[var(--radius-md)] text-[var(--text-sm)] flex-shrink-0"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "var(--text-primary)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── 主体 ── */}
      {isEmpty && !scanStarted ? (
        <EmptyState onStartScan={() => handleStartScan(false)} />
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 左栏：概念列表 */}
          <div
            className="w-[220px] flex-shrink-0 border-r overflow-y-auto"
            style={{ borderColor: "var(--border-primary)" }}
          >
            <ConceptList
              concepts={filteredConcepts}
              selectedId={selectedConceptId}
              isLoading={isLoading}
              onSelect={selectConcept}
            />
          </div>

          {/* 右栏：概念详情 */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {selectedConceptId && conceptDetail ? (
              <ConceptDetailPanel
                detail={conceptDetail}
                isLoading={isLoadingDetail}
                onUpdateDefinition={(def) =>
                  void updateConcept(selectedConceptId, undefined, def)
                }
                onSynthesizeViewpoints={() =>
                  void synthesizeViewpoints(selectedConceptId)
                }
                onGenerateExtensions={() =>
                  void generateExtensions(selectedConceptId)
                }
                onEnterUnderstanding={handleEnterUnderstanding}
              />
            ) : selectedConceptId && isLoadingDetail ? (
              <DetailSkeleton />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p
                  className="text-[var(--text-sm)]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  选择左侧概念查看详情
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 子组件：空状态引导
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ onStartScan }: { onStartScan: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-[var(--space-4)] p-[var(--space-8)]">
      <div
        className="w-16 h-16 rounded-[var(--radius-xl)] flex items-center justify-center"
        style={{ background: "var(--surface-tertiary)" }}
      >
        <BrainCircuit size={28} style={{ color: "var(--brand-navy)" }} />
      </div>
      <div className="text-center space-y-[var(--space-2)]">
        <h3
          className="text-[var(--text-base)] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          尚未提取概念
        </h3>
        <p
          className="text-[var(--text-sm)] max-w-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          扫描您的文档，AI 将自动提取跨课程的核心概念并建立知识关联。
        </p>
      </div>
      <button
        type="button"
        onClick={onStartScan}
        className="flex items-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-2)] rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium transition-colors"
        style={{ background: "var(--brand-navy)", color: "#fff" }}
      >
        <ScanLine size={15} />
        开始扫描
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 子组件：提取进度条
// ─────────────────────────────────────────────────────────────────────────────

function ExtractionProgressBar({ progress }: { progress: ExtractionProgress }) {
  const pct =
    progress.totalAssets > 0
      ? Math.round((progress.processed / progress.totalAssets) * 100)
      : 0;

  return (
    <div
      className="flex-shrink-0 px-[var(--space-4)] py-[var(--space-2)] border-b space-y-[var(--space-1)]"
      style={{ borderColor: "var(--border-primary)", background: "var(--surface-secondary)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[var(--text-xs)]" style={{ color: "var(--text-secondary)" }}>
          正在扫描文档…
        </span>
        <span className="text-[var(--text-xs)]" style={{ color: "var(--text-tertiary)" }}>
          已处理 {progress.processed}/{progress.totalAssets} 个文档 · 发现 {progress.conceptsFound} 个概念
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--surface-tertiary)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: "var(--brand-navy)" }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 子组件：详情骨架屏
// ─────────────────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="p-[var(--space-5)] space-y-[var(--space-4)] animate-pulse">
      <div className="h-5 w-48 rounded" style={{ background: "var(--surface-tertiary)" }} />
      <div className="h-3 w-full rounded" style={{ background: "var(--surface-tertiary)" }} />
      <div className="h-3 w-4/5 rounded" style={{ background: "var(--surface-tertiary)" }} />
      <div className="h-px" style={{ background: "var(--border-primary)" }} />
      {[80, 60, 90].map((w, i) => (
        <div
          key={i}
          className="h-3 rounded"
          style={{ width: `${w}%`, background: "var(--surface-tertiary)" }}
        />
      ))}
    </div>
  );
}
