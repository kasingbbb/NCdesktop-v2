import { create } from "zustand";
import type { Asset, AssetViewMode, SortConfig } from "../types";
import type { AIAnalysis, AssetType } from "../types/asset";
import * as cmd from "../lib/tauri-commands";

/** 后端 camelCase 为 assetType，统一映射到前端 `type` 供预览/Inspector 使用 */
function normalizeAsset(a: Asset): Asset {
  const r = a as Asset & { assetType?: string; originalName?: string };
  const t = (r.assetType ?? r.type ?? "other") as AssetType;
  const originalName =
    r.originalName && r.originalName.trim().length > 0 ? r.originalName : r.name;
  const sourceData = (r as { sourceData?: string | null }).sourceData;
  return { ...r, type: t, originalName, sourceData: sourceData ?? undefined };
}

interface AssetStore {
  assets: Asset[];
  /** 项目内各素材的标签名（与 assets 同步于 fetch） */
  assetTagNamesById: Record<string, string[]>;
  selectedAssetId: string | null;
  /** 多选集合 — 框选 / Cmd+Click / Cmd+A 维护 */
  selectedAssetIds: Set<string>;
  viewMode: AssetViewMode;
  sortConfig: SortConfig;
  isLoading: boolean;
  error: string | null;

  fetchAssets: (projectId: string) => Promise<void>;
  fetchAssetsByTag: (projectId: string, tagId: string) => Promise<void>;
  createAsset: (params: {
    projectId: string;
    assetType: string;
    name: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
  }) => Promise<Asset>;
  updateAsset: (asset: Asset) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  selectAsset: (id: string | null) => void;
  toggleSelectAsset: (id: string) => void;
  setSelectedAssetIds: (ids: Set<string>) => void;
  clearSelection: () => void;
  setViewMode: (mode: AssetViewMode) => void;
  setSortConfig: (config: SortConfig) => void;
  getSelectedAsset: () => Asset | undefined;
  getAssetAnalysis: (assetId: string) => Promise<AIAnalysis | null>;
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  assets: [],
  assetTagNamesById: {},
  selectedAssetId: null,
  selectedAssetIds: new Set<string>(),
  viewMode: "grid",
  sortConfig: { field: "capturedAt", direction: "desc" },
  isLoading: false,
  error: null,

  fetchAssets: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const raw = await cmd.getAssets(projectId);
      const assets = raw.map(normalizeAsset);
      const assetTagNamesById = await cmd.getProjectAssetTagMap(projectId);
      set({ assets, assetTagNamesById, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  fetchAssetsByTag: async (projectId, tagId) => {
    set({ isLoading: true, error: null });
    try {
      const raw = await cmd.getAssetsByTag(projectId, tagId);
      const assets = raw.map(normalizeAsset);
      const assetTagNamesById = await cmd.getProjectAssetTagMap(projectId);
      set({ assets, assetTagNamesById, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  createAsset: async (params) => {
    const asset = await cmd.createAsset(params);
    set((s) => ({ assets: [asset, ...s.assets] }));
    return asset;
  },

  updateAsset: async (asset) => {
    await cmd.updateAsset(asset);
    set((s) => ({
      assets: s.assets.map((a) => (a.id === asset.id ? asset : a)),
    }));
  },

  deleteAsset: async (id) => {
    await cmd.deleteAsset(id);
    set((s) => ({
      assets: s.assets.filter((a) => a.id !== id),
      selectedAssetId: s.selectedAssetId === id ? null : s.selectedAssetId,
    }));
  },

  toggleStar: async (id) => {
    const newStarred = await cmd.toggleAssetStar(id);
    set((s) => ({
      assets: s.assets.map((a) =>
        a.id === id ? { ...a, isStarred: newStarred } : a
      ),
    }));
  },

  selectAsset: (id) => set({ selectedAssetId: id }),

  toggleSelectAsset: (id) =>
    set((s) => {
      const next = new Set(s.selectedAssetIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedAssetIds: next };
    }),

  setSelectedAssetIds: (ids) => set({ selectedAssetIds: ids }),

  clearSelection: () => set({ selectedAssetIds: new Set<string>() }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setSortConfig: (config) => set({ sortConfig: config }),

  getSelectedAsset: () => {
    const { assets, selectedAssetId } = get();
    return assets.find((a) => a.id === selectedAssetId);
  },

  getAssetAnalysis: async (assetId) => {
    return cmd.getAssetAnalysis(assetId);
  },
}));
