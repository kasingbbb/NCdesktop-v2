/**
 * 用户自定义 Prompt 功能 — 设置面板组件（task_007_dev_frontend_ui）
 *
 * 真相来源：
 *   - PRD § 3.1（UI 草图与文案）
 *   - Architect output.md § 4.5（UI 视觉分层）/ § 5.5（数据流）/ § 7（目录结构）/ ADR-005 / R4
 *
 * 命名隔离（ADR-005 / R6）：
 *   - 组件名 `PromptCustomizationPanel`，与 PR-4 半成品 `PromptEditor.tsx`（kind=classify/naming/tagging）
 *     字面与语义完全独立，不复用。
 *   - 数据源 `useUserPromptStore`（task_006 落地）。
 *
 * 设计要点：
 *   1. 4 个折叠子项按 `PROMPT_MODULES` 固定顺序渲染（tagging → para → concept → aggregation）。
 *   2. mount 时 `useEffect` 调一次 `loadAll()`；折叠状态由本组件 useState 自管，不入 store。
 *   3. textarea 与 store.drafts 双向绑定；dirty / byteLen / placeholder 缺失由 store 与本地派生。
 *   4. 保存按钮三态禁用：缺占位符 / 字节超限 / dirty=false。
 *   5. 字节计数颜色三段：<80% maxBytes 灰 / 80-100% 橙 / >100% 红。
 *   6. 错误显示：每子项操作前清空 store.error；失败时在该子项下方红色横条展示。
 *   7. "全部恢复默认" + 单条"恢复默认"均 `window.confirm` 二次确认（按 AC-1 / AC-2 文案）。
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useUserPromptStore } from "../../stores/userPromptStore";
import {
  PROMPT_MODULES,
  PROMPT_MODULE_TITLES,
  type PromptInfo,
  type PromptModule,
} from "../../types/user-prompt";

/** 占位符是否全部满足。 */
function checkPlaceholdersOk(text: string, required: string[]): boolean {
  if (required.length === 0) return true;
  return required.every((p) => text.includes(p));
}

/** 字节计数颜色：按比例分三段。 */
function byteColor(n: number, max: number): string {
  if (n > max) return "#ef4444"; // red-500：超限
  if (n >= max * 0.8) return "#f59e0b"; // amber-500：接近上限
  return "var(--text-tertiary)";
}

export function PromptCustomizationPanel() {
  // ────────────────────────────────────────────────────
  // store hooks（细粒度 selector，避免无关字段变更触发重渲）
  // ────────────────────────────────────────────────────
  const items = useUserPromptStore((s) => s.items);
  const drafts = useUserPromptStore((s) => s.drafts);
  const dirty = useUserPromptStore((s) => s.dirty);
  const error = useUserPromptStore((s) => s.error);
  const loadAll = useUserPromptStore((s) => s.loadAll);
  const setDraft = useUserPromptStore((s) => s.setDraft);
  const save = useUserPromptStore((s) => s.save);
  const reset = useUserPromptStore((s) => s.reset);
  const byteLen = useUserPromptStore((s) => s.byteLen);

  // ────────────────────────────────────────────────────
  // 折叠态：本地 useState 自管（不入 store；input.md 技术约束）
  // 初始全部折叠（AC-1）
  // ────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Record<PromptModule, boolean>>({
    tagging: false,
    para: false,
    concept: false,
    aggregation: false,
  });

  // ────────────────────────────────────────────────────
  // 挂载时一次性加载全部 4 条（AC-1）
  // ────────────────────────────────────────────────────
  useEffect(() => {
    void loadAll();
    // 仅 mount 时执行；loadAll 引用稳定（zustand action）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleExpanded = useCallback((module: PromptModule) => {
    setExpanded((s) => ({ ...s, [module]: !s[module] }));
  }, []);

  // ────────────────────────────────────────────────────
  // "全部恢复默认" 操作（AC-1）
  // ────────────────────────────────────────────────────
  const handleResetAll = useCallback(async () => {
    const ok = window.confirm(
      "将恢复全部 4 条 Prompt 为内置默认值，已有自定义会丢失。继续？",
    );
    if (!ok) return;
    // 操作前清空 error（AC-4）
    useUserPromptStore.setState({ error: null });
    try {
      await reset(null);
    } catch {
      /* error 已写入 store，UI 自动展示 */
    }
  }, [reset]);

  return (
    <div
      className="space-y-[var(--space-4)]"
      data-testid="prompt-customization-panel"
    >
      {/* 顶部标题 */}
      <h3
        className="text-[var(--text-base)] font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        Prompt 自定义
      </h3>

      {/* 顶部说明文案（PRD § 3.1） */}
      <div
        className="text-[var(--text-xs)] leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        <p>以下为系统内置的 AI 处理策略。</p>
        <p>修改后将影响对应功能的输出结果。</p>
        <p>如不确定,请保持默认值。</p>
      </div>

      {/* 4 个折叠子项 */}
      <div className="space-y-[var(--space-2)]">
        {PROMPT_MODULES.map((module) => (
          <PromptModuleSection
            key={module}
            module={module}
            title={PROMPT_MODULE_TITLES[module]}
            item={items[module]}
            draft={drafts[module]}
            isDirty={dirty[module]}
            isExpanded={expanded[module]}
            error={error}
            onToggle={() => toggleExpanded(module)}
            onDraftChange={(text) => setDraft(module, text)}
            onSave={async () => {
              useUserPromptStore.setState({ error: null });
              try {
                await save(module);
              } catch {
                /* error 已写入 store */
              }
            }}
            onReset={async () => {
              const ok = window.confirm(
                `将恢复「${PROMPT_MODULE_TITLES[module]}」为内置默认值。继续？`,
              );
              if (!ok) return;
              useUserPromptStore.setState({ error: null });
              try {
                await reset(module);
              } catch {
                /* error 已写入 store */
              }
            }}
            byteLen={byteLen(module)}
          />
        ))}
      </div>

      {/* 底部「全部恢复默认」 */}
      <div className="flex justify-end pt-[var(--space-2)]">
        <button
          type="button"
          data-testid="reset-all-button"
          onClick={() => void handleResetAll()}
          className="px-[var(--space-3)] py-[var(--space-2)] rounded-[var(--radius-sm)] text-[var(--text-xs)] transition-colors"
          style={{
            backgroundColor: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          全部恢复默认
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 单个 module 折叠子项
// ──────────────────────────────────────────────────────────────

interface PromptModuleSectionProps {
  module: PromptModule;
  title: string;
  item: PromptInfo | null;
  draft: string;
  isDirty: boolean;
  isExpanded: boolean;
  error: string | null;
  onToggle: () => void;
  onDraftChange: (text: string) => void;
  onSave: () => Promise<void>;
  onReset: () => Promise<void>;
  byteLen: number;
}

function PromptModuleSection({
  module,
  title,
  item,
  draft,
  isDirty,
  isExpanded,
  error,
  onToggle,
  onDraftChange,
  onSave,
  onReset,
  byteLen,
}: PromptModuleSectionProps) {
  const required = item?.requiredPlaceholders ?? [];
  const maxBytes = item?.maxBytes ?? 16384;
  const placeholdersOk = checkPlaceholdersOk(draft, required);
  const overByteLimit = byteLen > maxBytes;
  const isCustom = item?.isCustom ?? false;

  // 保存按钮禁用条件（AC-2 顺序）：① 占位符未满足 ② 字节超限 ③ dirty=false
  const saveDisabled = !placeholdersOk || overByteLimit || !isDirty;

  // 单条"恢复默认"按钮：仅在已自定义时可点
  const resetDisabled = !isCustom;

  return (
    <div
      data-testid={`prompt-section-${module}`}
      className="rounded-[var(--radius-md)]"
      style={{
        border: "1px solid var(--border-primary)",
        backgroundColor: "var(--surface-secondary)",
      }}
    >
      {/* 折叠头：点击展开 / 收起 */}
      <button
        type="button"
        onClick={onToggle}
        data-testid={`prompt-toggle-${module}`}
        className="w-full flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] text-left"
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown size={14} style={{ color: "var(--text-tertiary)" }} />
        ) : (
          <ChevronRight size={14} style={{ color: "var(--text-tertiary)" }} />
        )}
        <span
          className="text-[var(--text-sm)] font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </span>
        {/* 标题行右侧的状态指示（折叠态也可见，方便用户一眼看到哪些已自定义） */}
        <span
          className="ml-auto text-[var(--text-xs)] flex items-center gap-1"
          data-testid={`prompt-status-${module}`}
          style={{
            color: isCustom ? "var(--color-accent)" : "var(--text-tertiary)",
          }}
        >
          <span aria-hidden>●</span>
          <span>{isCustom ? "已自定义" : "默认"}</span>
        </span>
      </button>

      {/* 折叠体 */}
      {isExpanded && (
        <div
          className="px-[var(--space-3)] pb-[var(--space-3)] space-y-[var(--space-2)] border-t"
          style={{ borderColor: "var(--border-primary)" }}
        >
          {/* 必含占位符提示（chip） */}
          {required.length > 0 && (
            <div className="pt-[var(--space-2)] flex items-center flex-wrap gap-[var(--space-2)]">
              <span
                className="text-[var(--text-xs)]"
                style={{ color: "var(--text-tertiary)" }}
              >
                必含占位符：
              </span>
              {required.map((p) => (
                <code
                  key={p}
                  className="px-[var(--space-2)] py-0.5 rounded-[var(--radius-sm)] text-[11px] font-mono"
                  style={{
                    backgroundColor: "var(--surface-tertiary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  {p}
                </code>
              ))}
            </div>
          )}

          {/* textarea */}
          <textarea
            data-testid={`prompt-textarea-${module}`}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={14}
            className="w-full font-mono text-[12px] px-[var(--space-2)] py-[var(--space-2)] rounded-[var(--radius-sm)] resize-y"
            style={{
              backgroundColor: "var(--surface-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-primary)",
              lineHeight: 1.5,
            }}
            spellCheck={false}
          />

          {/* 占位符警告（缺失时） */}
          {!placeholdersOk && (
            <div
              data-testid={`placeholder-warning-${module}`}
              className="text-[var(--text-xs)]"
              style={{ color: "#ef4444" }}
            >
              缺少必含占位符：{required.filter((p) => !draft.includes(p)).join("、")}
              （保存按钮已禁用）
            </div>
          )}

          {/* 字节计数 */}
          <div className="flex items-center justify-between">
            <span
              className="text-[var(--text-xs)]"
              style={{ color: "var(--text-tertiary)" }}
            >
              {overByteLimit ? "已超过 16 KB 上限" : ""}
            </span>
            <span
              data-testid={`byte-counter-${module}`}
              className="text-[var(--text-xs)] font-mono tabular-nums"
              style={{ color: byteColor(byteLen, maxBytes) }}
            >
              {byteLen} / {maxBytes} 字节
            </span>
          </div>

          {/* 按钮区 */}
          <div className="flex items-center justify-end gap-[var(--space-2)] pt-[var(--space-1)]">
            <button
              type="button"
              data-testid={`reset-button-${module}`}
              disabled={resetDisabled}
              onClick={() => void onReset()}
              className="px-[var(--space-3)] py-[var(--space-1)] rounded-[var(--radius-sm)] text-[var(--text-xs)] transition-colors"
              style={{
                backgroundColor: "transparent",
                color: resetDisabled ? "var(--text-tertiary)" : "var(--text-secondary)",
                border: "1px solid var(--border-primary)",
                cursor: resetDisabled ? "not-allowed" : "pointer",
                opacity: resetDisabled ? 0.5 : 1,
              }}
            >
              恢复默认
            </button>
            <button
              type="button"
              data-testid={`save-button-${module}`}
              disabled={saveDisabled}
              onClick={() => void onSave()}
              className="px-[var(--space-3)] py-[var(--space-1)] rounded-[var(--radius-sm)] text-[var(--text-xs)] font-medium transition-colors"
              style={{
                backgroundColor: saveDisabled ? "var(--surface-tertiary)" : "var(--color-accent)",
                color: saveDisabled ? "var(--text-tertiary)" : "#ffffff",
                border: "1px solid transparent",
                cursor: saveDisabled ? "not-allowed" : "pointer",
                opacity: saveDisabled ? 0.6 : 1,
              }}
            >
              保存
            </button>
          </div>

          {/* 错误横条（AC-4：折叠子项下方红色） */}
          {error && (
            <div
              data-testid={`error-banner-${module}`}
              className="px-[var(--space-2)] py-[var(--space-2)] rounded-[var(--radius-sm)] text-[var(--text-xs)]"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                color: "#dc2626",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
