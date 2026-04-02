import { useCallback, useEffect, useRef, useState } from "react";

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseRubberBandSelectOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  /** 所有卡片的 id 与当前 DOM 节点（每次渲染后由调用方更新） */
  getItemRects: () => Array<{ id: string; rect: DOMRect }>;
  onSelectionChange: (ids: Set<string>) => void;
}

export function useRubberBandSelect({
  containerRef,
  getItemRects,
  onSelectionChange,
}: UseRubberBandSelectOptions) {
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const isSelectingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });

  const rectsIntersect = (a: SelectionRect, b: DOMRect): boolean => {
    return (
      a.x < b.right &&
      a.x + a.width > b.left &&
      a.y < b.bottom &&
      a.y + a.height > b.top
    );
  };

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      // 只响应容器空白区域的左键拖拽（排除按钮等交互元素）
      const target = e.target as HTMLElement;
      if (
        e.button !== 0 ||
        target.closest("button") ||
        target.closest("a") ||
        target.closest("[data-no-rubber]")
      ) return;

      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      startPosRef.current = {
        x: e.clientX - containerRect.left + container.scrollLeft,
        y: e.clientY - containerRect.top + container.scrollTop,
      };
      isSelectingRef.current = true;
      // 清空选中
      onSelectionChange(new Set());
      e.preventDefault();
    },
    [containerRef, onSelectionChange]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isSelectingRef.current) return;
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const currentX = e.clientX - containerRect.left + container.scrollLeft;
      const currentY = e.clientY - containerRect.top + container.scrollTop;

      const rect: SelectionRect = {
        x: Math.min(startPosRef.current.x, currentX),
        y: Math.min(startPosRef.current.y, currentY),
        width: Math.abs(currentX - startPosRef.current.x),
        height: Math.abs(currentY - startPosRef.current.y),
      };

      // 转为相对 viewport 的坐标用于 intersect 检查
      const viewportRect: SelectionRect = {
        x: rect.x - container.scrollLeft + containerRect.left,
        y: rect.y - container.scrollTop + containerRect.top,
        width: rect.width,
        height: rect.height,
      };

      setSelectionRect(rect);

      // 实时更新选中集合
      const itemRects = getItemRects();
      const selected = new Set<string>();
      for (const { id, rect: itemRect } of itemRects) {
        if (rectsIntersect(viewportRect, itemRect)) {
          selected.add(id);
        }
      }
      onSelectionChange(selected);
    },
    [containerRef, getItemRects, onSelectionChange]
  );

  const handleMouseUp = useCallback(() => {
    if (!isSelectingRef.current) return;
    isSelectingRef.current = false;
    setSelectionRect(null);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [containerRef, handleMouseDown, handleMouseMove, handleMouseUp]);

  return { selectionRect, isSelecting: isSelectingRef.current };
}
