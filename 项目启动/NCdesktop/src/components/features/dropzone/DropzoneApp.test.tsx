import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DropzoneApp } from "./DropzoneApp";
import type { DropzoneStore } from "../../../stores/dropzoneStore";
import { logger } from "../../../utils/logger";

const dropzoneHoisted = vi.hoisted(() => {
  const store: DropzoneStore = {
    phase: "idle",
    isExpanded: false,
    recentItems: [],
    processingProgress: 0,
    processingMessage: "",
    show: vi.fn(async () => {}),
    hide: vi.fn(async () => {}),
    toggle: vi.fn(async () => {}),
    setPhase: vi.fn(),
    toggleExpand: vi.fn(),
    setExpanded: vi.fn(),
    setProcessingUI: vi.fn(),
    clearProcessingUI: vi.fn(),
    addItem: vi.fn(),
    updateItemStatus: vi.fn(),
    clearRecentItems: vi.fn(),
  };

  const patchStore = (p: Partial<DropzoneStore>): void => {
    Object.assign(store, p);
  };

  const resetStore = (): void => {
    store.phase = "idle";
    store.isExpanded = false;
    vi.clearAllMocks();
  };

  const useDropzoneStoreMock = Object.assign((): DropzoneStore => store, {
    getState: (): DropzoneStore => store,
  });

  return { store, patchStore, resetStore, useDropzoneStoreMock };
});

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn().mockResolvedValue(vi.fn()),
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  LogicalSize: class LogicalSize {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  },
  getCurrentWindow: () => ({
    setSize: vi.fn().mockResolvedValue(undefined),
    startDragging: vi.fn().mockResolvedValue(undefined),
    startResizeDragging: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../../lib/tauri-commands", () => ({}));

vi.mock("./DropzoneIdle", () => ({ DropzoneIdle: () => <div data-testid="dz-idle" /> }));
vi.mock("./DropzoneAttract", () => ({ DropzoneAttract: () => <div data-testid="dz-attract" /> }));
vi.mock("./DropzoneProcessing", () => ({ DropzoneProcessing: () => <div data-testid="dz-processing" /> }));
vi.mock("./DropzoneComplete", () => ({ DropzoneComplete: () => <div data-testid="dz-complete" /> }));
vi.mock("./DropzoneExpanded", () => ({ DropzoneExpanded: () => <div data-testid="dz-expanded" /> }));

vi.mock("../../../stores/dropzoneStore", () => ({
  useDropzoneStore: dropzoneHoisted.useDropzoneStoreMock,
}));

vi.spyOn(logger, "info");

describe("DropzoneApp Component", () => {
  beforeEach(() => {
    dropzoneHoisted.resetStore();
  });

  it("renders DropzoneIdle by default", () => {
    render(<DropzoneApp />);
    expect(screen.getByTestId("dz-idle")).toBeInTheDocument();
    expect(logger.info).toHaveBeenCalledWith("DropzoneApp", "Phase changed", { phase: "idle" });
  });

  it("renders DropzoneAttract when phase is attract", () => {
    dropzoneHoisted.patchStore({ phase: "attract" });
    render(<DropzoneApp />);
    expect(screen.getByTestId("dz-attract")).toBeInTheDocument();
  });

  it("handles standard drag events by preventing default", () => {
    dropzoneHoisted.patchStore({ phase: "idle" });
    render(<DropzoneApp />);

    const idle = screen.getByTestId("dz-idle");
    const dragRegion = idle.parentElement?.parentElement?.parentElement;
    expect(dragRegion).toBeTruthy();

    const dragEnterEvent = new Event("dragenter", { bubbles: true, cancelable: true });
    fireEvent(dragRegion!, dragEnterEvent);
    expect(dragEnterEvent.defaultPrevented).toBe(true);

    const dragOverEvent = new Event("dragover", { bubbles: true, cancelable: true });
    fireEvent(dragRegion!, dragOverEvent);
    expect(dragOverEvent.defaultPrevented).toBe(true);
  });
});
