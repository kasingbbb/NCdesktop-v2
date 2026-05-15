/**
 * task_007_dev_frontend_ui — PromptCustomizationPanel 单元测试
 *
 * 覆盖 AC-5：
 *   1. 渲染 4 个折叠子项（初始全折叠）
 *   2. 点击第一个折叠头展开
 *   3. 输入文本触发 setDraft + dirty=true
 *   4. 缺占位符时保存按钮 disabled
 *   5. 点击保存调用 save(module)
 *   6. 单条"恢复默认"调用 reset(module)
 *   7. 底部"全部恢复默认"经 confirm 调用 reset(null)
 *   8. 状态指示：已自定义 vs 默认
 *   附加：字节超限色阶、占位符 chip 渲染、错误横条展示、loadAll 挂载触发
 *
 * 测试策略：vi.mock 整个 userPromptStore module，导出一个可被测试代码 setState 的真实 zustand store，
 * 使 PromptCustomizationPanel 的 selector 行为与生产一致；action 函数全是 vi.fn() 便于断言调用。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type {
  PromptInfo,
  PromptModule,
} from "../../../types/user-prompt";

// ─── mock store ────────────────────────────────────────────────
// 在 vi.mock 工厂内创建 store（避免 hoist 时引用未初始化的变量）；
// 工厂导出真实 zustand store，selector 行为与生产一致；
// 测试代码通过下方 `import * as storeModule` 拿到导出对象，反查 mock 状态。
vi.mock("../../../stores/userPromptStore", async () => {
  const { create } = await import("zustand");
  const store = create<TestStore>(() => ({
    items: { tagging: null, para: null, concept: null, aggregation: null },
    drafts: { tagging: "", para: "", concept: "", aggregation: "" },
    dirty: { tagging: false, para: false, concept: false, aggregation: false },
    loading: false,
    error: null,
    loadAll: vi.fn(async () => {}),
    setDraft: vi.fn(),
    save: vi.fn(async () => {}),
    reset: vi.fn(async () => {}),
    byteLen: (m: PromptModule) =>
      new TextEncoder().encode(store.getState().drafts[m]).length,
  }));
  return { useUserPromptStore: store };
});

interface TestStore {
  items: Record<PromptModule, PromptInfo | null>;
  drafts: Record<PromptModule, string>;
  dirty: Record<PromptModule, boolean>;
  loading: boolean;
  error: string | null;
  loadAll: ReturnType<typeof vi.fn>;
  setDraft: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  byteLen: (module: PromptModule) => number;
}

import { PromptCustomizationPanel } from "../PromptCustomizationPanel";
import { useUserPromptStore as mockStoreImport } from "../../../stores/userPromptStore";

// 类型断言：mock 工厂返回的就是 zustand store；提供 getState/setState 接口。
type StoreApi = {
  getState: () => TestStore;
  setState: (partial: Partial<TestStore>) => void;
};
const mockStore = mockStoreImport as unknown as StoreApi;

// ─── fixture helpers ───────────────────────────────────────────
function makeInfo(
  module: PromptModule,
  overrides: Partial<PromptInfo> = {},
): PromptInfo {
  return {
    module,
    displayTitle: module,
    defaultText: `[default ${module}]`,
    userText: null,
    isCustom: false,
    builtinVersion: "1.0",
    updatedAt: null,
    requiredPlaceholders: [],
    maxBytes: 16384,
    ...overrides,
  };
}

function seedLoaded(opts?: {
  tagging?: Partial<PromptInfo>;
  para?: Partial<PromptInfo>;
  concept?: Partial<PromptInfo>;
  aggregation?: Partial<PromptInfo>;
  drafts?: Partial<Record<PromptModule, string>>;
  dirty?: Partial<Record<PromptModule, boolean>>;
  error?: string | null;
}) {
  const items: Record<PromptModule, PromptInfo | null> = {
    tagging: makeInfo("tagging", opts?.tagging),
    para: makeInfo("para", opts?.para),
    concept: makeInfo("concept", {
      requiredPlaceholders: ["{content}"],
      ...opts?.concept,
    }),
    aggregation: makeInfo("aggregation", opts?.aggregation),
  };
  const drafts: Record<PromptModule, string> = {
    tagging: opts?.drafts?.tagging ?? items.tagging!.defaultText,
    para: opts?.drafts?.para ?? items.para!.defaultText,
    concept: opts?.drafts?.concept ?? items.concept!.defaultText,
    aggregation: opts?.drafts?.aggregation ?? items.aggregation!.defaultText,
  };
  const dirty: Record<PromptModule, boolean> = {
    tagging: opts?.dirty?.tagging ?? false,
    para: opts?.dirty?.para ?? false,
    concept: opts?.dirty?.concept ?? false,
    aggregation: opts?.dirty?.aggregation ?? false,
  };
  mockStore.setState({
    items,
    drafts,
    dirty,
    loading: false,
    error: opts?.error ?? null,
  });
}

beforeEach(() => {
  mockStore.setState({
    items: { tagging: null, para: null, concept: null, aggregation: null },
    drafts: { tagging: "", para: "", concept: "", aggregation: "" },
    dirty: { tagging: false, para: false, concept: false, aggregation: false },
    loading: false,
    error: null,
    loadAll: vi.fn(async () => {}),
    setDraft: vi.fn(),
    save: vi.fn(async () => {}),
    reset: vi.fn(async () => {}),
    byteLen: (m: PromptModule) =>
      new TextEncoder().encode(mockStore.getState().drafts[m]).length,
  });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────────────────────────
// 测试用例
// ──────────────────────────────────────────────────────────────

describe("AC-1 / AC-5 ① 渲染结构", () => {
  it("挂载时调一次 loadAll()", () => {
    const loadAll = vi.fn(async () => {});
    mockStore.setState({ loadAll });
    render(<PromptCustomizationPanel />);
    expect(loadAll).toHaveBeenCalledTimes(1);
  });

  it("渲染 4 个折叠子项（按 PROMPT_MODULES 顺序）", () => {
    render(<PromptCustomizationPanel />);
    expect(screen.getByTestId("prompt-customization-panel")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-section-tagging")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-section-para")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-section-concept")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-section-aggregation")).toBeInTheDocument();
  });

  it("初始全部折叠（textarea 不在 DOM 中）", () => {
    render(<PromptCustomizationPanel />);
    expect(
      screen.queryByTestId("prompt-textarea-tagging"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("prompt-textarea-aggregation"),
    ).not.toBeInTheDocument();
  });

  it("显示顶部说明文案与底部「全部恢复默认」按钮", () => {
    render(<PromptCustomizationPanel />);
    expect(
      screen.getByText("以下为系统内置的 AI 处理策略。"),
    ).toBeInTheDocument();
    expect(screen.getByText("修改后将影响对应功能的输出结果。")).toBeInTheDocument();
    expect(screen.getByTestId("reset-all-button")).toBeInTheDocument();
  });
});

describe("AC-5 ② 点击展开第一个折叠条", () => {
  it("点击 tagging 折叠头 → textarea 出现", () => {
    seedLoaded();
    render(<PromptCustomizationPanel />);

    expect(
      screen.queryByTestId("prompt-textarea-tagging"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("prompt-toggle-tagging"));

    expect(screen.getByTestId("prompt-textarea-tagging")).toBeInTheDocument();
  });

  it("再次点击折叠头 → textarea 消失（toggle）", () => {
    seedLoaded();
    render(<PromptCustomizationPanel />);

    const toggle = screen.getByTestId("prompt-toggle-tagging");
    fireEvent.click(toggle);
    expect(screen.getByTestId("prompt-textarea-tagging")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(
      screen.queryByTestId("prompt-textarea-tagging"),
    ).not.toBeInTheDocument();
  });
});

describe("AC-5 ③ 输入文本触发 setDraft", () => {
  it("textarea onChange 调 setDraft(module, text)", () => {
    seedLoaded();
    const setDraft = vi.fn();
    mockStore.setState({ setDraft });
    render(<PromptCustomizationPanel />);

    fireEvent.click(screen.getByTestId("prompt-toggle-tagging"));
    const textarea = screen.getByTestId("prompt-textarea-tagging");
    fireEvent.change(textarea, { target: { value: "我的自定义打标签 Prompt" } });

    expect(setDraft).toHaveBeenCalledWith("tagging", "我的自定义打标签 Prompt");
  });
});

describe("AC-5 ④ 占位符 / dirty / 字节状态对保存按钮的影响", () => {
  it("concept module 缺占位符 {content} 时，save 按钮 disabled + 显示警告", () => {
    seedLoaded({
      drafts: { concept: "我自己写的，没有 placeholder" },
      dirty: { concept: true },
    });
    render(<PromptCustomizationPanel />);
    fireEvent.click(screen.getByTestId("prompt-toggle-concept"));

    const save = screen.getByTestId("save-button-concept");
    expect(save).toBeDisabled();
    expect(
      screen.getByTestId("placeholder-warning-concept"),
    ).toBeInTheDocument();
  });

  it("concept module 占位符 OK + dirty=true → save 按钮可用", () => {
    seedLoaded({
      drafts: { concept: "我自己写的，含 {content}" },
      dirty: { concept: true },
    });
    render(<PromptCustomizationPanel />);
    fireEvent.click(screen.getByTestId("prompt-toggle-concept"));

    expect(screen.getByTestId("save-button-concept")).not.toBeDisabled();
    expect(
      screen.queryByTestId("placeholder-warning-concept"),
    ).not.toBeInTheDocument();
  });

  it("dirty=false（草稿与生效一致）→ save 按钮 disabled", () => {
    seedLoaded({ dirty: { tagging: false } });
    render(<PromptCustomizationPanel />);
    fireEvent.click(screen.getByTestId("prompt-toggle-tagging"));

    expect(screen.getByTestId("save-button-tagging")).toBeDisabled();
  });

  it("字节超 16 KiB 上限时 save disabled + 计数显示红色 + 警示文案", () => {
    const huge = "x".repeat(17000); // 17 KiB ASCII = 17000 bytes
    seedLoaded({
      drafts: { tagging: huge },
      dirty: { tagging: true },
    });
    render(<PromptCustomizationPanel />);
    fireEvent.click(screen.getByTestId("prompt-toggle-tagging"));

    const save = screen.getByTestId("save-button-tagging");
    expect(save).toBeDisabled();

    const counter = screen.getByTestId("byte-counter-tagging");
    // #ef4444 = red-500
    expect(counter).toHaveStyle({ color: "#ef4444" });
    expect(screen.getByText("已超过 16 KB 上限")).toBeInTheDocument();
  });
});

describe("AC-5 ⑤ 点击保存调 save(module)", () => {
  it("save 按钮可用时点击 → 调 save(tagging) 一次", async () => {
    seedLoaded({
      drafts: { tagging: "改过的 prompt" },
      dirty: { tagging: true },
    });
    const save = vi.fn(async () => {});
    mockStore.setState({ save });
    render(<PromptCustomizationPanel />);

    fireEvent.click(screen.getByTestId("prompt-toggle-tagging"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("save-button-tagging"));
    });

    expect(save).toHaveBeenCalledWith("tagging");
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("AC-5 ⑥ 单条恢复默认 → reset(module)", () => {
  it("已自定义状态下点击「恢复默认」(单条) → confirm 后调 reset(module)", async () => {
    seedLoaded({
      tagging: { isCustom: true, userText: "我的自定义" },
      drafts: { tagging: "我的自定义" },
    });
    const reset = vi.fn(async () => {});
    mockStore.setState({ reset });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PromptCustomizationPanel />);

    fireEvent.click(screen.getByTestId("prompt-toggle-tagging"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("reset-button-tagging"));
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledWith("tagging");
  });

  it("confirm 拒绝时不调 reset", async () => {
    seedLoaded({
      tagging: { isCustom: true, userText: "我的自定义" },
    });
    const reset = vi.fn(async () => {});
    mockStore.setState({ reset });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PromptCustomizationPanel />);

    fireEvent.click(screen.getByTestId("prompt-toggle-tagging"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("reset-button-tagging"));
    });

    expect(reset).not.toHaveBeenCalled();
  });

  it("isCustom=false 时单条「恢复默认」按钮 disabled", () => {
    seedLoaded(); // 所有 isCustom 默认 false
    render(<PromptCustomizationPanel />);
    fireEvent.click(screen.getByTestId("prompt-toggle-tagging"));

    expect(screen.getByTestId("reset-button-tagging")).toBeDisabled();
  });
});

describe("AC-5 ⑦ 全部恢复默认 → reset(null)", () => {
  it("点击「全部恢复默认」+ confirm → reset(null)", async () => {
    seedLoaded();
    const reset = vi.fn(async () => {});
    mockStore.setState({ reset });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PromptCustomizationPanel />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("reset-all-button"));
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(
      "将恢复全部 4 条 Prompt 为内置默认值，已有自定义会丢失。继续？",
    );
    expect(reset).toHaveBeenCalledWith(null);
  });

  it("confirm 拒绝时不调 reset", async () => {
    seedLoaded();
    const reset = vi.fn(async () => {});
    mockStore.setState({ reset });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PromptCustomizationPanel />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("reset-all-button"));
    });

    expect(reset).not.toHaveBeenCalled();
  });
});

describe("AC-5 ⑧ 状态指示「已自定义」vs「默认」", () => {
  it("isCustom=true → 显示「已自定义」", () => {
    seedLoaded({ tagging: { isCustom: true, userText: "我的自定义" } });
    render(<PromptCustomizationPanel />);

    const status = screen.getByTestId("prompt-status-tagging");
    expect(status.textContent).toContain("已自定义");
  });

  it("isCustom=false → 显示「默认」", () => {
    seedLoaded(); // 默认 isCustom=false
    render(<PromptCustomizationPanel />);

    const status = screen.getByTestId("prompt-status-tagging");
    expect(status.textContent).toContain("默认");
    expect(status.textContent).not.toContain("已自定义");
  });
});

describe("附加：占位符 chip 展示", () => {
  it("concept 展开后显示 {content} chip", () => {
    seedLoaded();
    render(<PromptCustomizationPanel />);
    fireEvent.click(screen.getByTestId("prompt-toggle-concept"));

    // chip 在折叠体内
    const section = screen.getByTestId("prompt-section-concept");
    expect(section).toHaveTextContent("必含占位符");
    expect(section).toHaveTextContent("{content}");
  });

  it("requiredPlaceholders 为空时不显示占位符提示行", () => {
    seedLoaded(); // tagging requiredPlaceholders = []
    render(<PromptCustomizationPanel />);
    fireEvent.click(screen.getByTestId("prompt-toggle-tagging"));

    const section = screen.getByTestId("prompt-section-tagging");
    expect(section).not.toHaveTextContent("必含占位符");
  });
});

describe("AC-4 错误横条", () => {
  it("store.error 非空 + 折叠展开 → 显示该子项下方红色横条", () => {
    seedLoaded({ error: "保存失败：服务暂不可用" });
    render(<PromptCustomizationPanel />);
    fireEvent.click(screen.getByTestId("prompt-toggle-tagging"));

    const banner = screen.getByTestId("error-banner-tagging");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain("保存失败：服务暂不可用");
  });

  it("点击保存时操作前清空 error（再次失败由后续 save 写入）", async () => {
    seedLoaded({
      drafts: { tagging: "改过的" },
      dirty: { tagging: true },
      error: "上一轮残留的错误消息",
    });
    const save = vi.fn(async () => {});
    mockStore.setState({ save });
    render(<PromptCustomizationPanel />);

    fireEvent.click(screen.getByTestId("prompt-toggle-tagging"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("save-button-tagging"));
    });

    // 操作前清空 → 此时 mockStore.error 应为 null
    expect(mockStore.getState().error).toBeNull();
    expect(save).toHaveBeenCalledWith("tagging");
  });
});
