/**
 * ConceptList — 知识关联左侧概念列表
 *
 * - 搜索过滤后实时渲染
 * - 激活态高亮
 * - 加载骨架屏
 * - 空状态提示
 *
 * 约束（宪章 A1/A2）：named export，CSS 变量
 */

import type { ConceptWithStats } from "../../../types/knowledge";

interface Props {
  concepts: ConceptWithStats[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string | null) => void;
}

export function ConceptList({ concepts, selectedId, isLoading, onSelect }: Props) {
  // 加载骨架
  if (isLoading && concepts.length === 0) {
    return (
      <div className="p-[var(--space-2)] space-y-[var(--space-1)] animate-pulse">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-8 rounded-[var(--radius-sm)]"
            style={{ background: "var(--surface-tertiary)", opacity: 1 - i * 0.1 }}
          />
        ))}
      </div>
    );
  }

  // 空状态
  if (concepts.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 px-[var(--space-3)]">
        <p
          className="text-[var(--text-xs)] text-center"
          style={{ color: "var(--text-tertiary)" }}
        >
          无匹配概念
        </p>
      </div>
    );
  }

  return (
    <div className="py-[var(--space-1)]">
      {concepts.map((concept) => {
        const isActive = selectedId === concept.id;
        return (
          <button
            key={concept.id}
            type="button"
            onClick={() => onSelect(concept.id)}
            className="w-full flex items-start gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] text-left transition-colors"
            style={{
              background: isActive
                ? "var(--sidebar-active-bg, var(--surface-tertiary))"
                : "transparent",
            }}
          >
            {/* 图钉图标 */}
            <span
              className="flex-shrink-0 mt-0.5"
              style={{ color: isActive ? "var(--brand-navy)" : "var(--text-tertiary)" }}
            >
              📌
            </span>

            <div className="min-w-0 flex-1">
              {/* 概念名 */}
              <p
                className="text-[var(--text-sm)] font-medium truncate leading-5"
                style={{
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                {concept.name}
              </p>

              {/* 统计数据 */}
              <p
                className="text-[10px] mt-0.5"
                style={{ color: "var(--text-tertiary)" }}
              >
                {concept.sourceProjectCount > 0
                  ? `${concept.sourceProjectCount} 个项目引用`
                  : ""}
                {concept.viewpointCount > 0
                  ? ` · ${concept.viewpointCount} 个观点`
                  : ""}
              </p>
            </div>

            {/* 用户编辑标记 */}
            {concept.userEdited && (
              <span
                className="flex-shrink-0 text-[9px] px-1 py-px rounded mt-0.5"
                style={{
                  background: "var(--surface-tertiary)",
                  color: "var(--text-tertiary)",
                  border: "1px solid var(--border-primary)",
                }}
              >
                已编辑
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
