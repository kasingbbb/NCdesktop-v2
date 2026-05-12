/**
 * KnowledgeHubView — 4-step 聚合视图入口（PRD F-P0-8 / ADR-004）
 *
 * 4-step：assets → concepts → library → skills。
 * 这是「聚合视图顺序约定」（PRD §10 Glossary），**不是 wizard**：
 *   - 横向 nav 切换，无 prev/next 按钮
 *   - 任意 step 可深链直达
 *
 * 路由：原生 hash route `#/knowledge-hub/:step`
 *   - pushState + popstate 双向同步（前进/后退可用，PRD AC-13）
 *   - 旧 hash `#/skills` `#/knowledge` 自动 replaceState（PRD AC-12）
 */

import { useCallback } from "react";
import { useUIStore } from "../../../stores/uiStore";
import { useHubHashRoute } from "./useHubHashRoute";
import type { HubStep } from "./types";
import { AssetsStep } from "./steps/AssetsStep";
import { ConceptsStep } from "./steps/ConceptsStep";
import { LibraryStep } from "./steps/LibraryStep";
import { SkillsStep } from "./steps/SkillsStep";

interface Props {
  libraryId: string | null;
}

const STEP_LABELS: Record<HubStep, string> = {
  assets: "素材",
  concepts: "概念",
  library: "知识库",
  skills: "技能",
};

export function KnowledgeHubView({ libraryId }: Props) {
  const setSidebarSection = useUIStore((s) => s.setSidebarSection);

  const onLegacyMigrated = useCallback(() => {
    setSidebarSection("knowledge-hub");
  }, [setSidebarSection]);

  const { step, setStep, steps } = useHubHashRoute({ onLegacyMigrated });

  return (
    <div className="flex flex-col h-full min-h-0">
      <StepNav steps={steps} current={step} onSelect={setStep} />
      <div className="flex-1 min-h-0 overflow-hidden">
        {step === "assets" && <AssetsStep />}
        {step === "concepts" && <ConceptsStep />}
        {step === "library" && <LibraryStep />}
        {step === "skills" && <SkillsStep libraryId={libraryId} />}
      </div>
    </div>
  );
}

interface StepNavProps {
  steps: readonly HubStep[];
  current: HubStep;
  onSelect: (next: HubStep) => void;
}

function StepNav({ steps, current, onSelect }: StepNavProps) {
  return (
    <nav
      role="tablist"
      aria-label="Knowledge Hub Steps"
      className="flex items-center gap-[var(--space-1)] px-[var(--space-3)] py-[var(--space-2)] border-b"
      style={{ borderColor: "var(--border-primary)" }}
    >
      {steps.map((s) => {
        const active = s === current;
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(s)}
            className="px-[var(--space-3)] py-[var(--space-1)] text-[var(--text-sm)] rounded-[var(--radius-sm)] transition-colors"
            style={{
              background: active ? "var(--surface-tertiary)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: active ? 600 : 400,
            }}
          >
            {STEP_LABELS[s]}
          </button>
        );
      })}
    </nav>
  );
}
