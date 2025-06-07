/* eslint-disable @typescript-eslint/no-explicit-any */
// API Service for interacting with the backend API endpoints

import { ConfigType, ActionResult, AuditLogEntry } from "../types";

/**
 * Executes an import or export operation
 */
export async function syncConfig(
  type: ConfigType,
  direction: "import" | "export",
  dryRun: boolean = false
): Promise<ActionResult> {
  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type, direction, dryRun }),
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
