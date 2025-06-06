/* eslint-disable @typescript-eslint/no-explicit-any */
// API Service for interacting with the backend API endpoints

import {
  ConfigStatus,
  ConfigType,
  DiffResult,
  SyncJob,
  ActionResult,
  SnapshotInfo,
  AuditLogEntry,
} from "../types";

/**
 * Fetches the status of all configuration types
 */
export async function getConfigStatuses(): Promise<ConfigStatus[]> {
  try {
    const response = await fetch("/api/status");
    if (!response.ok) {
      throw new Error(
        `Failed to fetch config statuses: ${response.statusText}`
      );
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching config statuses:", error);
    throw error;
  }
}

/**
 * Gets the differences between local config files and the Directus instance
 */
export async function getDifferences(type: ConfigType): Promise<DiffResult> {
  try {
    const response = await fetch(`/api/diff/${type}`);
    if (!response.ok) {
      throw new Error(`Failed to get differences: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching differences for ${type}:`, error);
    throw error;
  }
}

/**
 * Executes an import or export operation
 */
export async function syncConfig(
  type: ConfigType,
  direction: "import" | "export"
): Promise<ActionResult> {
  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type, direction }),
    });

    if (!response.ok) {
      throw new Error(`Failed to ${direction} ${type}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error syncing ${type} (${direction}):`, error);
    throw error;
  }
}

/**
 * Gets the history of sync jobs
 */
export async function getSyncJobs(): Promise<SyncJob[]> {
  try {
    const response = await fetch("/api/jobs");
    if (!response.ok) {
      throw new Error(`Failed to fetch sync jobs: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching sync jobs:", error);
    throw error;
  }
}

/**
 * Checks if snapshots are available
 */
export async function checkForSnapshots(): Promise<{
  hasSnapshots: boolean;
  lastSnapshot: string;
}> {
  try {
    const response = await fetch("/api/snapshots/check");
    if (!response.ok) {
      throw new Error(`Failed to check snapshots: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error checking snapshots:", error);
    throw error;
  }
}

/**
 * Gets snapshots for a specific configuration type
 */
export async function getSnapshots(type: ConfigType): Promise<SnapshotInfo[]> {
  try {
    const response = await fetch(`/api/snapshots/${type}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch snapshots for ${type}: ${response.statusText}`
      );
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching snapshots for ${type}:`, error);
    throw error;
  }
}

/**
 * Gets the content of a specific snapshot
 */
export async function getSnapshotContent(
  type: ConfigType,
  id: string
): Promise<any> {
  try {
    const response = await fetch(`/api/snapshots/${type}/${id}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch snapshot content: ${response.statusText}`
      );
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching snapshot content:`, error);
    throw error;
  }
}

/**
 * Gets audit log entries for a specific configuration type
 */
export async function getAuditLogs(type: ConfigType): Promise<AuditLogEntry[]> {
  try {
    const response = await fetch(`/api/audit/${type}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch audit logs for ${type}: ${response.statusText}`
      );
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching audit logs for ${type}:`, error);
    throw error;
  }
}

/**
 * Creates a new snapshot of the current Directus instance
 */
export async function createSnapshot(): Promise<ActionResult> {
  try {
    const response = await fetch("/api/snapshot", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Failed to create snapshot: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error creating snapshot:", error);
    throw error;
  }
}

/**
 * Compares snapshot with configuration files
 */
export async function compareSnapshot(): Promise<
  ActionResult & { diffResults?: any }
> {
  try {
    const response = await fetch("/api/snapshot/compare");
    if (!response.ok) {
      throw new Error(`Failed to compare snapshot: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error comparing snapshot:", error);
    throw error;
  }
}

// Export all API functions as a single object for easier importing
export const api = {
  getConfigStatuses,
  getDifferences,
  syncConfig,
  getSyncJobs,
  checkForSnapshots,
  getSnapshots,
  getAuditLogs,
  createSnapshot,
  compareSnapshot,
};
