/* eslint-disable @typescript-eslint/no-explicit-any */
// Types for the Directus Config Toolkit UI

export type ConfigType =
  | "flows"
  | "operations"
  | "roles"
  | "access"
  | "policies"
  | "permissions"
  | "settings"
  | "files"
  | "folders"
  | "schema";

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

export interface SnapshotInfo {
  id: string;
  path: string;
}

export interface AuditLogEntry {
  timestamp: string;
  operation: "import" | "export";
  manager: string;
  itemType: string;
  status: "success" | "failure";
  message?: string;
  snapshotFile?: string;
  localConfigSnapshot?: string;
  remoteBeforeSnapshot?: string;
  remoteAfterSnapshot?: string;
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

export interface AuthResponse {
  data: {
    access_token: string;
    expires: number;
    refresh_token?: string;
  };
}
