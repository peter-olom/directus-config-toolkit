// Types for the Directus Config Toolkit UI

export type ConfigType = "flows" | "roles" | "settings" | "files" | "schema";

export interface ConfigStatus {
  type: ConfigType;
  itemsCount: number;
  lastSync: string;
  status: "synced" | "pending" | "conflict";
}

export interface DiffItem {
  path: string;
  type: "added" | "removed" | "modified";
  oldValue?: any;
  newValue?: any;
}

export interface DiffResult {
  type: ConfigType;
  differences: DiffItem[];
  timestamp: string;
}

export interface SyncJob {
  id: string;
  type: ConfigType;
  direction: "import" | "export";
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
}
