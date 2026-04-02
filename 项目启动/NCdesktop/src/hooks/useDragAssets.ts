import { useCallback } from "react";

/** MIME type used to carry dragged asset IDs between cards and drop targets */
export const DRAG_ASSET_TYPE = "application/notecapt-assets";

export interface DragAssetPayload {
  assetIds: string[];
}

/**
 * Returns a factory that produces drag-event props for each asset card.
 * If the dragged card is part of the multi-selection, all selected IDs are
 * included in the payload; otherwise only the dragged card is.
 */
export function useDragAssets(selectedAssetIds: Set<string>) {
  const makeDragProps = useCallback(
    (assetId: string) => {
      return {
        draggable: true as const,
        onDragStart: (e: React.DragEvent<HTMLElement>) => {
          const ids = selectedAssetIds.has(assetId)
            ? Array.from(selectedAssetIds)
            : [assetId];
          const payload: DragAssetPayload = { assetIds: ids };
          e.dataTransfer.setData(DRAG_ASSET_TYPE, JSON.stringify(payload));
          e.dataTransfer.effectAllowed = "copyMove";
        },
      };
    },
    [selectedAssetIds]
  );

  return { makeDragProps };
}
