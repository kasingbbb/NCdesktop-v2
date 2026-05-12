/**
 * v2 Sidebar Redesign — TagTree 单元测试（task_008 / PRD F-P0-11 / AC-8）。
 *
 * 覆盖：
 *   - AC-1 默认折叠（aria-expanded="false"，子 tag 不在 DOM）
 *   - AC-2 展开 + tags > 20 → 仅渲染前 20 + "更多… (N)"
 *   - AC-2 展开 + tags ≤ 20 → 全部渲染，无"更多…"
 *   - AC-3 点击"更多…" → 余项 mount，按钮变"收起更多"
 *   - AC-3 重新折叠后展开，showAll 重置
 *   - AC-4 a11y：分组标题按钮键盘 Enter/Space 触发展开
 *   - AC-6 性能：> 20 时 DOM 节点 = 21
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("../../../lib/tauri-commands", () => ({
  getTags: vi.fn(async () => []),
}));

import { TagTree } from "../TagTree";
import { useTagStore } from "../../../stores/tagStore";
import { useUIStore } from "../../../stores/uiStore";
import type { Tag } from "../../../types/common";

const INITIAL_UI = useUIStore.getState();

function makeTags(n: number): Tag[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    name: `tag-${i + 1}`,
    color: "#fff",
    source: "user" as const,
    usageCount: i,
  }));
}

beforeEach(() => {
  useTagStore.setState({ tags: [], isLoading: false, error: null });
  useUIStore.setState({ ...INITIAL_UI, assetTagFilterId: null });
});

describe("TagTree — task_008 F-P0-11", () => {
  it("AC-1 默认折叠：aria-expanded=false，子项不在 DOM", () => {
    useTagStore.setState({ tags: makeTags(5), isLoading: false, error: null });
    render(<TagTree />);
    const toggle = screen.getByRole("button", { name: /Tags/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("tag-1")).toBeNull();
  });

  it("AC-2 展开 + tags ≤ 20 → 全部渲染，无更多入口", () => {
    useTagStore.setState({ tags: makeTags(10), isLoading: false, error: null });
    render(<TagTree />);
    const toggle = screen.getByRole("button", { name: /Tags/i });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    for (let i = 1; i <= 10; i++) {
      expect(screen.getByText(`tag-${i}`)).toBeTruthy();
    }
    expect(screen.queryByText(/更多…/)).toBeNull();
  });

  it("AC-2/AC-6 展开 + tags > 20 → 前 20 + '更多… (N)'，DOM 节点共 21", () => {
    useTagStore.setState({ tags: makeTags(25), isLoading: false, error: null });
    const { container } = render(<TagTree />);
    fireEvent.click(screen.getByRole("button", { name: /Tags/i }));
    for (let i = 1; i <= 20; i++) {
      expect(screen.getByText(`tag-${i}`)).toBeTruthy();
    }
    expect(screen.queryByText("tag-21")).toBeNull();
    expect(screen.getByText("更多… (5)")).toBeTruthy();
    // 21 个 sidebar-item button（20 tag + 1 更多）
    const items = container.querySelectorAll("button.sidebar-item");
    expect(items.length).toBe(21);
  });

  it("AC-3 点击 '更多…' → 剩余项 mount，文案变为 '收起更多'，DOM = N+1", () => {
    useTagStore.setState({ tags: makeTags(25), isLoading: false, error: null });
    const { container } = render(<TagTree />);
    fireEvent.click(screen.getByRole("button", { name: /Tags/i }));
    fireEvent.click(screen.getByText("更多… (5)"));
    for (let i = 1; i <= 25; i++) {
      expect(screen.getByText(`tag-${i}`)).toBeTruthy();
    }
    expect(screen.getByText("收起更多")).toBeTruthy();
    const items = container.querySelectorAll("button.sidebar-item");
    expect(items.length).toBe(26);
  });

  it("AC-3 重新折叠 → 再展开后 showAll 重置（仅前 20 显示）", () => {
    useTagStore.setState({ tags: makeTags(25), isLoading: false, error: null });
    render(<TagTree />);
    const toggle = screen.getByRole("button", { name: /Tags/i });
    fireEvent.click(toggle); // 展开
    fireEvent.click(screen.getByText("更多… (5)")); // showAll
    expect(screen.getByText("tag-25")).toBeTruthy();
    fireEvent.click(toggle); // 折叠
    fireEvent.click(toggle); // 再展开
    expect(screen.queryByText("tag-25")).toBeNull();
    expect(screen.getByText("更多… (5)")).toBeTruthy();
  });

  it("AC-4 a11y：分组标题按钮支持键盘 Enter / Space（原生 button 行为）", () => {
    useTagStore.setState({ tags: makeTags(3), isLoading: false, error: null });
    render(<TagTree />);
    const toggle = screen.getByRole("button", { name: /Tags/i });
    expect(toggle.tagName).toBe("BUTTON");
    // 原生 button 由浏览器把 Enter/Space 转为 click — 这里直接 click 验证语义可达
    act(() => {
      toggle.focus();
    });
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("tag-1")).toBeTruthy();
  });

  it("AC-1 / AC-5 空 tag 列表 + 默认折叠：提示文案也不渲染（folded 时不渲染 children）", () => {
    useTagStore.setState({ tags: [], isLoading: false, error: null });
    render(<TagTree />);
    expect(screen.queryByText(/暂无标签/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tags/i }));
    expect(screen.getByText(/暂无标签/)).toBeTruthy();
  });
});
