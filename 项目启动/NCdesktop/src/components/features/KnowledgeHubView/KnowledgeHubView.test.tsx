/**
 * KnowledgeHubView 渲染 + StepNav 切换测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock 子 step（避免拉起重组件 / 避免它们的 store 依赖）
vi.mock("./steps/AssetsStep", () => ({
  AssetsStep: () => <div data-testid="step-assets">ASSETS</div>,
}));
vi.mock("./steps/ConceptsStep", () => ({
  ConceptsStep: () => <div data-testid="step-concepts">CONCEPTS</div>,
}));
vi.mock("./steps/LibraryStep", () => ({
  LibraryStep: () => <div data-testid="step-library">LIBRARY</div>,
}));
vi.mock("./steps/SkillsStep", () => ({
  SkillsStep: ({ libraryId }: { libraryId: string | null }) => (
    <div data-testid="step-skills">SKILLS:{String(libraryId)}</div>
  ),
}));

// Mock uiStore（只需 setSidebarSection）
const setSidebarSection = vi.fn();
vi.mock("../../../stores/uiStore", () => ({
  useUIStore: (selector?: (s: unknown) => unknown) => {
    const state = { setSidebarSection };
    return selector ? selector(state) : state;
  },
}));

import { KnowledgeHubView } from "./index";

function setHash(h: string) {
  window.history.replaceState(null, "", h || "/");
}

describe("KnowledgeHubView", () => {
  beforeEach(() => {
    setHash("");
    setSidebarSection.mockReset();
  });
  afterEach(() => {
    setHash("");
  });

  it("默认渲染 assets step（无 hash）", () => {
    render(<KnowledgeHubView libraryId="lib-1" />);
    expect(screen.getByTestId("step-assets")).toBeInTheDocument();
  });

  it("hash=#/knowledge-hub/library → 渲染 library step", () => {
    setHash("#/knowledge-hub/library");
    render(<KnowledgeHubView libraryId="lib-1" />);
    expect(screen.getByTestId("step-library")).toBeInTheDocument();
  });

  it("点击 StepNav 切换 step 并 pushState 更新 URL", () => {
    setHash("#/knowledge-hub/assets");
    render(<KnowledgeHubView libraryId="lib-1" />);
    fireEvent.click(screen.getByRole("tab", { name: "技能" }));
    expect(screen.getByTestId("step-skills")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/knowledge-hub/skills");
  });

  it("4 个 step 都能渲染（concepts）", () => {
    setHash("#/knowledge-hub/assets");
    render(<KnowledgeHubView libraryId="lib-1" />);
    fireEvent.click(screen.getByRole("tab", { name: "概念" }));
    expect(screen.getByTestId("step-concepts")).toBeInTheDocument();
  });

  it("旧 hash #/skills 启动重定向 + 同步 setSidebarSection('knowledge-hub')", () => {
    setHash("#/skills");
    render(<KnowledgeHubView libraryId="lib-1" />);
    expect(window.location.hash).toBe("#/knowledge-hub/skills");
    expect(setSidebarSection).toHaveBeenCalledWith("knowledge-hub");
    expect(screen.getByTestId("step-skills")).toBeInTheDocument();
  });

  it("当前 step 的 tab 高亮（aria-selected=true）", () => {
    setHash("#/knowledge-hub/library");
    render(<KnowledgeHubView libraryId="lib-1" />);
    const libTab = screen.getByRole("tab", { name: "知识库" });
    expect(libTab.getAttribute("aria-selected")).toBe("true");
    const assetsTab = screen.getByRole("tab", { name: "素材" });
    expect(assetsTab.getAttribute("aria-selected")).toBe("false");
  });

  it("libraryId=null 时 SkillsStep 收到 null prop", () => {
    setHash("#/knowledge-hub/skills");
    render(<KnowledgeHubView libraryId={null} />);
    expect(screen.getByTestId("step-skills").textContent).toBe("SKILLS:null");
  });
});
