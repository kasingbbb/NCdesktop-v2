/** 应用设置 */
export interface AppSettings {
  theme: "light" | "dark" | "system";
  sidebarWidth: number;
  timelineHeight: number;

  autoImportOnConnect: boolean;
  importDeleteOriginal: boolean;
  defaultImportPath: string;

  dropzoneEnabled: boolean;
  dropzonePosition: { x: number; y: number };
  dropzoneSize: "small" | "medium" | "large";
  dropzoneAutoClassify: boolean;

  defaultPlaybackSpeed: number;
  preRollSeconds: number;
  waveformColor: string;

  transcriptionLanguage: string;
  aiClassificationEnabled: boolean;
  llmBridgeTarget: LLMTarget;

  analyticsEnabled: boolean;
  dataStoragePath: string;
}

/** LLM 目标 */
export type LLMTarget =
  | { type: "notebookLM" }
  | { type: "chatgpt" }
  | { type: "claude" }
  | { type: "custom"; endpoint: string };
