/* eslint-disable @typescript-eslint/no-explicit-any */
// API Service for interacting with the directus-config-toolkit CLI
// Real implementation that connects to the API server

import {
  ConfigStatus,
  ConfigType,
  DiffResult,
  SyncJob,
  ActionResult,
  AuthResponse,
} from "../types";

// Use relative API routes for Next.js API endpoints
const API_BASE_URL = "/api";

/**
 * Login to get a token
 */
export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Login failed");
    }

    return response.json();
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
}

/**
 * Fetches the status of all configuration types
 */
export async function getConfigStatuses(): Promise<ConfigStatus[]> {
  const response = await fetch(`${API_BASE_URL}/status`);
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Authentication required. Please log in again.");
    }
    throw new Error(`Failed to fetch config statuses: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Gets the differences between local config files and the Directus instance
 */
export async function getDifferences(type: ConfigType): Promise<DiffResult> {
  const response = await fetch(`${API_BASE_URL}/diff/${type}`);
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Authentication required. Please log in again.");
    }
    throw new Error(`Failed to get differences: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Executes an import or export operation
 */
export async function syncConfig(
  type: ConfigType,
  direction: "import" | "export"
): Promise<ActionResult> {
  const response = await fetch(`${API_BASE_URL}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, direction }),
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Authentication required. Please log in again.");
    }
    throw new Error(`Failed to sync: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Gets the history of sync jobs
 */
export async function getSyncJobs(): Promise<SyncJob[]> {
  const response = await fetch(`${API_BASE_URL}/jobs`);
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Authentication required. Please log in again.");
    }
    throw new Error(`Failed to fetch sync jobs: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Checks connection to the Directus instance
 */
export async function checkConnection(): Promise<ActionResult> {
  const response = await fetch(`${API_BASE_URL}/connection`);
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Authentication required. Please log in again.");
    }
    throw new Error(`Failed to check connection: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Runs a snapshot operation
 */
export async function createSnapshot(): Promise<ActionResult> {
  const response = await fetch(`${API_BASE_URL}/snapshot`, {
    method: "POST",
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Authentication required. Please log in again.");
    }
    throw new Error(`Failed to create snapshot: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Compares snapshot with configuration files
 */
export async function checkForSnapshots(): Promise<{
  hasSnapshots: boolean;
  lastSnapshot: string;
}> {
  const response = await fetch(`${API_BASE_URL}/snapshots/check`);
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Authentication required. Please log in again.");
    }
    throw new Error(`Failed to check snapshots: ${response.statusText}`);
  }
  return response.json();
}

export async function compareSnapshot(): Promise<
  ActionResult & { diffResults?: any }
> {
  const response = await fetch(`${API_BASE_URL}/snapshot/compare`);
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Authentication required. Please log in again.");
    }
    throw new Error(`Failed to compare snapshot: ${response.statusText}`);
  }
  return response.json();
}
