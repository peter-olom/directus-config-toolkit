// API Service for interacting with the directus-config-toolkit CLI
// Real implementation that connects to the API server

import {
  ConfigStatus,
  ConfigType,
  DiffResult,
  SyncJob,
  ActionResult,
} from "../types";

// Base URL for the API
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Fetches the status of all configuration types
 */
export async function getConfigStatuses(): Promise<ConfigStatus[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/status`);
    if (!response.ok)
      throw new Error(
        `Failed to fetch config statuses: ${response.statusText}`
      );
    const data = await response.json();
    return data.map((item: any) => ({
      ...item,
    }));
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
    const response = await fetch(`${API_BASE_URL}/diff/${type}`);
    if (!response.ok)
      throw new Error(`Failed to get differences: ${response.statusText}`);
    return response.json();
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
    const response = await fetch(`${API_BASE_URL}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, direction }),
    });
    if (!response.ok) throw new Error(`Failed to sync: ${response.statusText}`);
    return response.json();
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
    const response = await fetch(`${API_BASE_URL}/jobs`);
    if (!response.ok)
      throw new Error(`Failed to fetch sync jobs: ${response.statusText}`);
    return response.json();
  } catch (error) {
    console.error("Error fetching sync jobs:", error);
    throw error;
  }
}

/**
 * Checks connection to the Directus instance
 */
export async function checkConnection(): Promise<ActionResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/connection`);
    if (!response.ok)
      throw new Error(`Failed to check connection: ${response.statusText}`);
    return response.json();
  } catch (error) {
    console.error("Error checking connection:", error);
    throw error;
  }
}

/**
 * Runs a snapshot operation
 */
export async function createSnapshot(): Promise<ActionResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/snapshot`, {
      method: "POST",
    });
    if (!response.ok)
      throw new Error(`Failed to create snapshot: ${response.statusText}`);
    return response.json();
  } catch (error) {
    console.error("Error creating snapshot:", error);
    throw error;
  }
}

/**
 * Compares snapshot with configuration files
 */
export async function checkForSnapshots(): Promise<{
  hasSnapshots: boolean;
  lastSnapshot: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/snapshots/check`);
    if (!response.ok)
      throw new Error(`Failed to check snapshots: ${response.statusText}`);
    return response.json();
  } catch (error) {
    console.error("Error checking snapshots:", error);
    throw error;
  }
}

export async function compareSnapshot(): Promise<
  ActionResult & { diffResults?: any }
> {
  try {
    const response = await fetch(`${API_BASE_URL}/snapshot/compare`);
    if (!response.ok)
      throw new Error(`Failed to compare snapshot: ${response.statusText}`);
    return response.json();
  } catch (error) {
    console.error("Error comparing snapshot:", error);
    throw error;
  }
}
