import "@testing-library/jest-dom/vitest";

/** jsdom 未实现，TimelineView 等依赖 ResizeObserver 的组件测试需要 */
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverStub;
