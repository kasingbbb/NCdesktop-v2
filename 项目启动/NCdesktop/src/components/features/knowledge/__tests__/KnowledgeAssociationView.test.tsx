/**
 * KnowledgeAssociationView — v1.3 task_009 fix 单测覆盖
 *
 * 覆盖：
 *   - AC-1 toggle 默认 aria-checked="true"
 *   - AC-7 toggle role="switch"
 *   - toggle 点击切换 aria-checked
 *   - AC-5/6 合并按钮 disabled + data-merge-id 非空（在 ConceptList 中渲染）
 *
 * 注：实际过滤逻辑、置顶 + 浅琥珀条延后到 v1.4。本测试只覆盖"占位完整闭环"。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// mock Tauri event listen（KnowledgeAssociationView 用它监听 extraction-progress）
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

// mock 子组件：ConceptList 渲染真实合并按钮以便断言；ConceptDetailPanel 占位
vi.mock("../ConceptList", async () => {
  const actual = await vi.importActual<typeof import("../ConceptList")>("../ConceptList");
  return { ConceptList: actual.ConceptList };
});
vi.mock("../ConceptDetailPanel", () => ({
  ConceptDetailPanel: () => <div data-testid="mock-concept-detail" />,
}));
vi.mock("../../../KnowledgeUnderstanding/KnowledgeUnderstandingPage", () => ({
  KnowledgeUnderstandingPage: () => <div data-testid="mock-understanding-page" />,
}));

import { KnowledgeAssociationView } from "../KnowledgeAssociationView";
import { useKnowledgeStore } from "../../../../stores/knowledgeStore";
import { useLibraryStore } from "../../../../stores/libraryStore";
import { useKnowledgeUnderstandingStore } from "../../../../stores/knowledgeUnderstandingStore";

const INITIAL_KNOWLEDGE = useKnowledgeStore.getState();
const INITIAL_LIBRARY = useLibraryStore.getState();

beforeEach(() => {
  useKnowledgeStore.setState({
    ...INITIAL_KNOWLEDGE,
    concepts: [
      {
        id: "c1",
        libraryId: "lib-1",
        name: "测试概念 A",
        definition: "",
        sourceProjectCount: 0,
        viewpointCount: 0,
        userEdited: false,
      },
      {
        id: "c2",
        libraryId: "lib-1",
        name: "测试概念 B",
        definition: "",
        sourceProjectCount: 0,
        viewpointCount: 0,
        userEdited: false,
      },
    ] as unknown as ReturnType<typeof useKnowledgeStore.getState>["concepts"],
    selectedConceptId: null,
    conceptDetail: null,
    extractionProgress: null,
    searchQuery: "",
    isLoading: false,
    isLoadingDetail: false,
    error: null,
    fetchConcepts: vi.fn().mockResolvedValue(undefined),
    getFilteredConcepts: () =>
      (useKnowledgeStore.getState().concepts as unknown as Array<{ id: string }>),
  } as unknown as ReturnType<typeof useKnowledgeStore.getState>);

  useLibraryStore.setState({
    ...INITIAL_LIBRARY,
    activeLibraryId: "lib-1",
  });

  useKnowledgeUnderstandingStore.setState({
    conceptId: null,
  } as unknown as ReturnType<typeof useKnowledgeUnderstandingStore.getState>);
});

describe("KnowledgeAssociationView — v1.3 task_009 占位闭环", () => {
  it("AC-1：toggle 默认 aria-checked='true'", () => {
    render(<KnowledgeAssociationView />);
    const toggle = screen.getByTestId("knowledge-assoc-linked-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("AC-7：toggle role='switch'", () => {
    render(<KnowledgeAssociationView />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute("data-testid")).toBe("knowledge-assoc-linked-toggle");
  });

  it("点击 toggle 切换 aria-checked 在 true/false 之间", () => {
    render(<KnowledgeAssociationView />);
    const toggle = screen.getByTestId("knowledge-assoc-linked-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("AC-5/6：每个概念条目右侧合并按钮 disabled + data-merge-id 非空", () => {
    const { container } = render(<KnowledgeAssociationView />);
    // 直接按 data-merge-id 属性查找真正的 button（避开外层 div role=button 误命中）
    const mergeButtons = container.querySelectorAll("button[data-merge-id]");
    expect(mergeButtons.length).toBeGreaterThanOrEqual(2); // 2 个概念
    mergeButtons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
      expect(btn.textContent).toMatch(/合并/);
      expect(btn.getAttribute("data-merge-id")).toBeTruthy();
      expect(btn.getAttribute("title")).toBe("v1.4 合并 modal 待开");
    });
  });
});
