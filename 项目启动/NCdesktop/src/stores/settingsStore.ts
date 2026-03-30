import { create } from "zustand";
import type { AppSettings, LLMTarget } from "../types";
import * as cmd from "../lib/tauri-commands";

const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  sidebarWidth: 220,
  timelineHeight: 180,
  autoImportOnConnect: true,
  importDeleteOriginal: false,
  defaultImportPath: "",
  dropzoneEnabled: true,
  dropzonePosition: { x: 100, y: 100 },
  dropzoneSize: "medium",
  dropzoneAutoClassify: true,
  defaultPlaybackSpeed: 1,
  preRollSeconds: 5,
  waveformColor: "#FFC000",
  transcriptionLanguage: "zh",
  aiClassificationEnabled: true,
  llmBridgeTarget: { type: "chatgpt" },
  analyticsEnabled: false,
  dataStoragePath: "",
};

interface SettingsStore {
  settings: AppSettings;
  isLoading: boolean;

  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  setTheme: (theme: AppSettings["theme"]) => Promise<void>;
  setLLMTarget: (target: LLMTarget) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const raw = await cmd.getAllSettings();
      const merged = { ...DEFAULT_SETTINGS };
      for (const [key, value] of Object.entries(raw)) {
        try {
          (merged as Record<string, unknown>)[key] = JSON.parse(value);
        } catch {
          (merged as Record<string, unknown>)[key] = value;
        }
      }
      set({ settings: merged as AppSettings, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  updateSetting: async (key, value) => {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    await cmd.setSetting(key, serialized);
    set((s) => ({ settings: { ...s.settings, [key]: value } }));
  },

  setTheme: async (theme) => {
    await get().updateSetting("theme", theme);
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else if (theme === "light") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    }
  },

  setLLMTarget: async (target) => {
    await get().updateSetting("llmBridgeTarget", target);
  },
}));
