import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import App from "./App";
import { logger } from "./utils/logger";

// Mock zustand stores since we just want to test rendering
vi.mock("./stores/uiStore", () => ({
  useUIStore: vi.fn(),
}));

vi.mock("./stores/libraryStore", () => ({
  useLibraryStore: vi.fn(),
}));

vi.mock("./stores/projectStore", () => ({
  useProjectStore: vi.fn(),
}));

// Mock child components to isolate App testing
vi.mock("./components/layout/AppLayout", () => ({
  AppLayout: () => <div data-testid="app-layout">AppLayout Mock</div>
}));

vi.mock("./components/features/dropzone/DropzoneApp", () => ({
  DropzoneApp: () => <div data-testid="dropzone-app">DropzoneApp Mock</div>
}));

// Mock logger
vi.spyOn(logger, "info");

describe("App Component", () => {
  it("renders AppLayout by default", () => {
    // Reset window.location.pathname mock
    Object.defineProperty(window, "location", {
      value: { pathname: "/" },
      writable: true,
    });

    render(<App />);
    expect(screen.getByTestId("app-layout")).toBeInTheDocument();
  });

  it("renders DropzoneApp when pathname is /dropzone", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/dropzone" },
      writable: true,
    });

    render(<App />);
    expect(screen.getByTestId("dropzone-app")).toBeInTheDocument();
  });

  it("logs mount event", () => {
    render(<App />);
    expect(logger.info).toHaveBeenCalledWith("App", "Application mounted", expect.any(Object));
  });
});
