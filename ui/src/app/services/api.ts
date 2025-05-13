// API Service for interacting with the directus-config-toolkit CLI
// This is a mock implementation that will be replaced with real API calls later

import {
  ConfigStatus,
  ConfigType,
  DiffResult,
  SyncJob,
  ActionResult,
} from "../types";
import { mockConfigStatuses, mockDiffResults, mockSyncJobs } from "../mockData";

// Base URL for the API
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Fetches the status of all configuration types
 */
export async function getConfigStatuses(): Promise<ConfigStatus[]> {
  // Mock implementation
  return Promise.resolve(mockConfigStatuses);

  // Real implementation would be:
  // const response = await fetch(`${API_BASE_URL}/status`);
  // if (!response.ok) throw new Error(`Failed to fetch config statuses: ${response.statusText}`);
  // return response.json();
}

/**
 * Gets the differences between local config files and the Directus instance
 */
export async function getDifferences(type: ConfigType): Promise<DiffResult> {
  // Mock implementation
  return Promise.resolve(mockDiffResults[type]);

  // Real implementation would be:
  // const response = await fetch(`${API_BASE_URL}/diff/${type}`);
  // if (!response.ok) throw new Error(`Failed to get differences: ${response.statusText}`);
  // return response.json();
}

/**
 * Executes an import or export operation
 */
export async function syncConfig(
  type: ConfigType,
  direction: "import" | "export"
): Promise<ActionResult> {
  // Mock implementation
  return Promise.resolve({
    success: true,
    message: `Successfully ${direction}ed ${type} configuration`,
  });

  // Real implementation would be:
  // const response = await fetch(`${API_BASE_URL}/sync`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ type, direction })
  // });
  // if (!response.ok) throw new Error(`Failed to sync: ${response.statusText}`);
  // return response.json();
}

/**
 * Gets the history of sync jobs
 */
export async function getSyncJobs(): Promise<SyncJob[]> {
  // Mock implementation
  return Promise.resolve(mockSyncJobs);

  // Real implementation would be:
  // const response = await fetch(`${API_BASE_URL}/jobs`);
  // if (!response.ok) throw new Error(`Failed to fetch sync jobs: ${response.statusText}`);
  // return response.json();
}

/**
 * Checks connection to the Directus instance
 */
export async function checkConnection(): Promise<ActionResult> {
  // Mock implementation
  return Promise.resolve({
    success: true,
    message: "Successfully connected to Directus instance",
  });

  // Real implementation would be:
  // const response = await fetch(`${API_BASE_URL}/connection`);
  // if (!response.ok) throw new Error(`Failed to check connection: ${response.statusText}`);
  // return response.json();
}

/**
 * Runs a snapshot operation
 */
export async function createSnapshot(): Promise<ActionResult> {
  // Mock implementation
  return Promise.resolve({
    success: true,
    message: "Successfully created snapshot",
  });

  // Real implementation would be:
  // const response = await fetch(`${API_BASE_URL}/snapshot/create`, {
  //   method: 'POST'
  // });
  // if (!response.ok) throw new Error(`Failed to create snapshot: ${response.statusText}`);
  // return response.json();
}

/**
 * Compares snapshot with configuration files
 */
export async function compareSnapshot(): Promise<ActionResult> {
  // Mock implementation
  return Promise.resolve({
    success: true,
    message: "Successfully compared snapshot",
    data: { differences: 3 },
  });

  // Real implementation would be:
  // const response = await fetch(`${API_BASE_URL}/snapshot/compare`);
  // if (!response.ok) throw new Error(`Failed to compare snapshot: ${response.statusText}`);
  // return response.json();
}
